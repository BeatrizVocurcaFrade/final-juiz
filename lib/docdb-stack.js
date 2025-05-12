const { Stack, RemovalPolicy } = require('aws-cdk-lib');
const ec2 = require('aws-cdk-lib/aws-ec2');
const docdb = require('aws-cdk-lib/aws-docdb');

class DocdbStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    // VPC compartilhada (ou criar nova)
    const vpc = new ec2.Vpc(this, 'DocdbVpc', {
      maxAzs: 2,
    });

    const sg = new ec2.SecurityGroup(this, 'DocdbSG', {
      vpc,
      description: 'Allow access to DocumentDB',
      allowAllOutbound: true,
    });

    const cluster = new docdb.DatabaseCluster(this, 'JudgesDocdbCluster', {
      masterUser: {
        username: 'docdbadmin',
      },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      vpc,
      securityGroup: sg,
      removalPolicy: RemovalPolicy.DESTROY,
      instances: 1,
    });

    this.vpc = vpc;
    this.securityGroup = sg;
    this.cluster = cluster;
  }
}

module.exports = { DocdbStack };


// const { Stack, RemovalPolicy } = require('aws-cdk-lib');
// const ec2 = require('aws-cdk-lib/aws-ec2');
// const docdb = require('aws-cdk-lib/aws-docdb');

// class DocdbStack extends Stack {
//   constructor(scope, id, props) {
//     super(scope, id, props);

//     // VPC compartilhada (ou criar nova)
//     const vpc = new ec2.Vpc(this, 'DocdbVpc', {
//       maxAzs: 2,
//     });

//     const sg = new ec2.SecurityGroup(this, 'DocdbSG', {
//       vpc,
//       description: 'Allow access to DocumentDB',
//       allowAllOutbound: true,
//     });

//     const cluster = new docdb.DatabaseCluster(this, 'JudgesDocdbCluster', {
//       masterUser: {
//         username: 'docdbadmin',
//       },
//       instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
//       vpc,
//       securityGroup: sg,
//       removalPolicy: RemovalPolicy.DESTROY,
//       instances: 1,
//     });

//     this.vpc = vpc;
//     this.securityGroup = sg;
//     this.cluster = cluster;
//   }
// }

// module.exports = { DocdbStack };
