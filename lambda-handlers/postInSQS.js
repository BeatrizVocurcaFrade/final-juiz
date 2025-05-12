// lambda-handlers/postInSQS.js
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

const lambdaClient = new LambdaClient({});
const sqsClient = new SQSClient({});

// Estes valores virão das variáveis de ambiente configuradas pelo CDK
const GET_JUDGES_LAMBDA_NAME = process.env.GET_JUDGES_LAMBDA_NAME;
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;

exports.handler = async (event) => {
  console.log("postInSQS Lambda_A invoked. Event:", JSON.stringify(event, null, 2));
  console.log("GET_JUDGES_LAMBDA_NAME:", GET_JUDGES_LAMBDA_NAME);
  console.log("SQS_QUEUE_URL:", SQS_QUEUE_URL);

  if (!GET_JUDGES_LAMBDA_NAME || !SQS_QUEUE_URL) {
    console.error("Configuration error: GET_JUDGES_LAMBDA_NAME or SQS_QUEUE_URL not set.");
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server configuration error." }),
    };
  }

  let judgesList = [];

  try {
    console.log(`Invoking Lambda: ${GET_JUDGES_LAMBDA_NAME}`);
    const invokeParams = {
      FunctionName: GET_JUDGES_LAMBDA_NAME,
      InvocationType: 'RequestResponse', // Invoca sincronamente
      // Payload: JSON.stringify({ key: "value" }) // Se getJudges precisasse de um payload
    };
    const command = new InvokeCommand(invokeParams);
    const response = await lambdaClient.send(command);

    // O Payload da resposta é um Uint8Array, precisamos decodificá-lo
    const payloadString = new TextDecoder().decode(response.Payload);
    const getJudgesResponse = JSON.parse(payloadString);
    console.log("Response from getJudges Lambda_A:", JSON.stringify(getJudgesResponse, null, 2));

    if (getJudgesResponse.statusCode === 200) {
      judgesList = JSON.parse(getJudgesResponse.body); // O body da getJudges é uma string JSON
    } else {
      console.error("getJudges Lambda_A returned an error:", getJudgesResponse);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Failed to retrieve judges list.", details: getJudgesResponse }),
      };
    }

  } catch (error) {
    console.error("Error invoking getJudges Lambda_A:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Error invoking getJudges Lambda_A.", error: error.message }),
    };
  }

  if (judgesList.length === 0) {
    console.log("No judges to process.");
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "No judges to process." }),
    };
  }

  const sqsPromises = judgesList.map(async (judge) => {
    const sqsParams = {
      QueueUrl: SQS_QUEUE_URL,
      MessageBody: JSON.stringify(judge),
      // MessageGroupId: "JudgesGroup", // Necessário para Filas FIFO
      // MessageDeduplicationId: judge._id // Necessário para Filas FIFO
    };
    try {
      console.log(`Sending message to SQS for judge: ${judge.name}`);
      await sqsClient.send(new SendMessageCommand(sqsParams));
      console.log(`Message sent for judge: ${judge.name}`);
      return { success: true, judgeName: judge.name };
    } catch (error) {
      console.error(`Error sending message to SQS for judge ${judge.name}:`, error);
      return { success: false, judgeName: judge.name, error: error.message };
    }
  });

  try {
    const results = await Promise.all(sqsPromises);
    const successfulSends = results.filter(r => r.success).length;
    const failedSends = results.filter(r => !r.success).length;

    console.log(`SQS Send Results: ${successfulSends} successful, ${failedSends} failed.`);
    if (failedSends > 0) {
        // Poderia retornar detalhes dos erros aqui
        return {
            statusCode: 207, // Multi-Status
            body: JSON.stringify({
                message: `Processed ${judgesList.length} judges. ${successfulSends} sent to SQS, ${failedSends} failed.`,
                results
            }),
        };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Successfully processed ${judgesList.length} judges and sent them to SQS.`,
        results
      }),
    };
  } catch (error) {
      console.error("Error in Promise.all for SQS sends:", error);
       return {
        statusCode: 500,
        body: JSON.stringify({ message: "Error processing SQS messages.", error: error.message }),
      };
  }
};