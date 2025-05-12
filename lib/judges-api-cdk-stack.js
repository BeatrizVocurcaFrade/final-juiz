const ec2 = require('aws-cdk-lib/aws-ec2');
const docdb = require('aws-cdk-lib/aws-docdb');


const { Stack, Duration, CfnOutput, RemovalPolicy } = require('aws-cdk-lib');
const lambda = require('aws-cdk-lib/aws-lambda');
const apigateway = require('aws-cdk-lib/aws-apigateway'); // Já importado
const sqs = require('aws-cdk-lib/aws-sqs');
const { SqsEventSource } = require('aws-cdk-lib/aws-lambda-event-sources'); // <-- NOVO: Para SQS como trigger
// const iam = require('aws-cdk-lib/aws-iam'); // Não estritamente necessário se usar os métodos grant*
const path = require('path');

class JudgesApiCdkStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);


    const vpc = ec2.Vpc.fromLookup(this, 'Vpc', { isDefault: true });

    const cluster = new docdb.DatabaseCluster(this, 'JudgesDocDBCluster', {
      masterUser: {
        username: 'admin',
      },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      vpc,
      removalPolicy: RemovalPolicy.DESTROY,
      instances: 1,
      defaultDatabaseName: 'judgesdb',
    });


    // --- Lambda getJudges (existente) ---
    const getJudgesLambda = new lambda.Function(this, 'GetJudgesLambdaHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda-handlers')),
      handler: 'getJudges.handler',
      memorySize: 128,
      timeout: Duration.seconds(10),
    });

    // --- NOVA: Fila SQS (existente) ---
    const judgesQueue = new sqs.Queue(this, 'JudgesQueue', {
      queueName: 'JudgesProcessingQueue',
      visibilityTimeout: Duration.seconds(30),
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // --- NOVA: Lambda postInSQS (existente) ---
    const postInSqsLambda = new lambda.Function(this, 'PostInSqsLambdaHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda-handlers')),
      handler: 'postInSQS.handler',
      memorySize: 256,
      timeout: Duration.seconds(30),
      environment: {
        GET_JUDGES_LAMBDA_NAME: getJudgesLambda.functionName,
        SQS_QUEUE_URL: judgesQueue.queueUrl,
      },
    });

    // --- Permissões para postInSqsLambda (existentes) ---
    getJudgesLambda.grantInvoke(postInSqsLambda);
    judgesQueue.grantSendMessages(postInSqsLambda);


    // --- API Gateway (existente) ---
    const api = new apigateway.RestApi(this, 'JudgesApiGateway', {
      restApiName: 'JudgesApi',
      description: 'API para servir dados de juízes.',
      deployOptions: {
        stageName: 'prod',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS, // Permite POST também se for o caso
        allowHeaders: [
          'Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key',
          'X-Amz-Security-Token', 'X-Amz-User-Agent'
        ],
      }
    });

    // Endpoint para getJudges (existente)
    const getJudgesIntegration = new apigateway.LambdaIntegration(getJudgesLambda);
    const judgesResource = api.root.addResource('judges');
    judgesResource.addMethod('GET', getJudgesIntegration);

    // --- NOVO: Endpoint para postInSqsLambda ---
    // Criar um recurso (endpoint) '/process-judges'
    const processJudgesResource = api.root.addResource('process-judges');

    // Criar a integração da Lambda postInSqsLambda com o API Gateway
    const postInSqsIntegration = new apigateway.LambdaIntegration(postInSqsLambda);

    // Adicionar um método (ex: POST ou GET) ao recurso '/process-judges'
    // Se a lambda for apenas disparada sem corpo de requisição, GET pode ser ok.
    // Se você planeja enviar dados no corpo da requisição para a lambda no futuro, use POST.
    // Para o caso atual, onde a lambda não usa o payload do API Gateway, GET ou POST funcionam.
    // Vamos usar POST por ser mais comum para ações que "processam" algo.
    processJudgesResource.addMethod('POST', postInSqsIntegration, {
      // apiKeyRequired: false, // Opcional, se quiser proteger com API Key
    });
    // Se preferir um GET:
    // processJudgesResource.addMethod('GET', postInSqsIntegration);y
 // --- NOVA: Lambda consumeFila ---
    const consumeFilaLambda = new lambda.Function(this, 'ConsumeFila-', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda-handlers')),
      handler: 'consumeFila',
      memorySize: 128,
      timeout: Duration.seconds(30), // Ajuste conforme necessário
      environment: {
        SQS_QUEUE_URL: judgesQueue.queueUrl,
        MONGO_URI: `mongodb://${cluster.clusterEndpoint.hostname}:27017`,
        MONGO_DB_NAME: 'judgesdb',
        MONGO_USER: 'admin',
        MONGO_PASSWORD: cluster.secret?.secretValueFromJson('password').toString(), // se usar secret manager
      },
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },

      vpc: props.vpc,
      securityGroups: [props.docdbSecurityGroup],
      environment: {
        SQS_QUEUE_URL: judgesQueue.queueUrl,
        DOCDB_ENDPOINT: props.docdbCluster.clusterEndpoint.hostname,
        DOCDB_USERNAME: 'docdbadmin',
        DOCDB_DBNAME: 'judgesdb',
      },


    });

    cluster.secret.grantRead(consumeFilaLambda);

        // --- Configurar SQS como gatilho para consumeFilaLambda ---
    consumeFilaLambda.addEventSource(new SqsEventSource(judgesQueue, {
      batchSize: 5, // Número de mensagens a serem processadas por invocação (ajuste de 1 a 10000, comum é 1-10)
      maxBatchingWindow: Duration.minutes(1), // Opcional: tempo máximo para coletar mensagens antes de invocar
      reportBatchItemFailures: true, // IMPORTANTE: permite que a Lambda retorne falhas parciais no lote
    }));
    // --- Outputs (existentes e novos) ---
    new CfnOutput(this, 'ApiGatewayBaseUrl', {
      value: api.url,
      description: 'The base URL of the API Gateway endpoint (including stage)',
    });
    new CfnOutput(this, 'ApiGatewayJudgesEndpoint', {
      value: `${api.url}judges`,
      description: 'The full URL of the /judges endpoint',
    });
    new CfnOutput(this, 'JudgesSqsQueueUrl', {
      value: judgesQueue.queueUrl,
      description: 'The URL of the SQS queue for judges.',
    });
    new CfnOutput(this, 'JudgesSqsQueueArn', {
      value: judgesQueue.queueArn,
      description: 'The ARN of the SQS queue for judges.',
    });
    new CfnOutput(this, 'PostInSqsLambdaName', {
        value: postInSqsLambda.functionName,
        description: 'The name of the PostInSQS Lambda function'
    });
    // NOVO Output para a URL da postInSqsLambda
    new CfnOutput(this, 'ApiGatewayProcessJudgesEndpoint', {
      value: `${api.url}process-judges`,
      description: 'The URL to trigger the SQS processing Lambda (POST request)',
    });
  }
}

module.exports = { JudgesApiCdkStack };