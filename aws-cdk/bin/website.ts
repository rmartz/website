#!/usr/bin/env node
import cdk = require('@aws-cdk/cdk');

import { Bucket, CfnBucket } from '@aws-cdk/aws-s3';
import { Certificate } from '@aws-cdk/aws-certificatemanager';
import { CloudFrontWebDistribution } from '@aws-cdk/aws-cloudfront';
import { AliasRecord, HostedZoneProvider } from '@aws-cdk/aws-route53';
import { Pipeline, GitHubSourceAction, Stage } from '@aws-cdk/aws-codepipeline';
import { Secret, SecretParameter } from '@aws-cdk/cdk';


class WebsiteStack extends cdk.Stack {
  constructor(parent: cdk.App, name: string, props?: cdk.StackProps) {
    super(parent, name, props);

    const stub = 'test';
    const domain = 'reedmartz.com'
    const fqdn = `${stub}.${domain}`;
    const redirect_source = 'redirect';
    const redirect_fqdn = `${redirect_source}.${domain}`;

    const zone = new HostedZoneProvider(this, {
      domainName: domain
    }).findAndImport(this, 'PrimaryDomain');

    const static_cert = new Certificate(this, 'Certificate', {
      domainName: fqdn,
      subjectAlternativeNames: [redirect_fqdn]
    });

    const static_bucket = new Bucket(this, 'StaticS3Bucket', {
      bucketName: fqdn,
      publicReadAccess: true
    });

    const static_cf = new CloudFrontWebDistribution(this, 'StaticCloudFront', {
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: static_bucket
          },
          behaviors : [
            {
              isDefaultBehavior: true,
              compress: true,
              maxTtlSeconds: 86400,
              minTtlSeconds: 0,
              defaultTtlSeconds: 3600
            }
          ],
        },
      ],
      loggingConfig: {
        bucket: new Bucket(this, 'LogS3Bucket', {
          bucketName: `${fqdn}-logs`
        }),
        prefix: `cloudfront/`
      },
      aliasConfiguration: {
        acmCertRef: static_cert.certificateArn,
        names: [fqdn]
      }
    });

    new AliasRecord(this, 'StaticDnsEntry', {
        recordName: stub,
        target: static_cf,
        zone: zone
    });

    const redirect_bucket = new Bucket(this, 'RedirectBucket', {
      bucketName: redirect_fqdn
    });
    const redirect_resource = redirect_bucket.node.findChild('Resource') as CfnBucket;
    redirect_resource.propertyOverrides.websiteConfiguration = {
      redirectAllRequestsTo: {
        hostName: fqdn,
        protocol: 'https'
      }
    }

    const redirect_cf = new CloudFrontWebDistribution(this, 'RedirectCloudFront', {
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: redirect_bucket
          },
          behaviors : [
            {
              isDefaultBehavior: true,
              compress: true,
            }
          ]
        },
      ],
      aliasConfiguration: {
        acmCertRef: static_cert.certificateArn,
        names: [redirect_fqdn]
      }
    });

    new AliasRecord(this, 'RedirectDnsEntry', {
        recordName: redirect_source,
        target: redirect_cf,
        zone: zone
    });
  }
}

class PipelineStack extends cdk.Stack {
  constructor(parent: cdk.App, name: string, props?: cdk.StackProps) {
    super(parent, name, props);
    /*
    const pipeline = new Pipeline(this, 'WebsitePipeline', {

    });

    const sourceStage = pipeline.addStage('Source');

    const oauthToken = new SecretParameter(this, 'GitHubOauthToken', {
      ssmParameter: 'foobar'
    });

    new GitHubSourceAction(this, 'GitHubSource', {
      stage: sourceStage,
      owner: 'rmartz',
      repo: 'website',
      branch: 'develop', // default: 'master'
      oauthToken: oauthToken.value
    });

    const deployStage = new Stage(this, "DeployStage", {

    });
    deployStage.onStateChange("")
    */
  }

}

const app = new cdk.App();

new WebsiteStack(app, 'ReedMartzStaticStack');
new PipelineStack(app, 'ReedMartzPipelineStack');

app.run();
