targetScope = 'resourceGroup'

param location string
@minLength(3)
@maxLength(10)
param name string = 'heirloom'
@description('Registry/repository without a tag. Publishing is a separate human gate.')
param imageRepository string
@description('Reviewed lowercase SHA-256 image digest, without the sha256: prefix.')
@minLength(64)
@maxLength(64)
param imageDigest string
@description('Existing managed environment, reviewed for region, networking and cost.')
param environmentId string
@description('Existing user-assigned identity with registry pull and Key Vault secret-read grants.')
param identityId string
param registryServer string
@description('Public build variables, identical to the image build. Do not put secret values here.')
param publicEnvironment object
@description('Exact 40-character source revision matching the image and retained Vercel build.')
@minLength(40)
@maxLength(40)
param sourceRevision string
@description('Array of {name, keyVaultUrl, envName}; URLs only. Include database, Clerk and Actions key.')
param secretReferences array
@allowed(['none', 'azure'])
param schedulerOwner string = 'none'
@description('Keep false until old scheduler is disabled and in-flight work has drained.')
param enableSchedules bool = false
@minValue(0)
@maxValue(1)
param minReplicas int = 0

var schedules = [
  { name: 'digest', path: '/api/cron/digest', cron: '0 14 * * 1' }
  { name: 'cook-along-reminders', path: '/api/cron/cook-along-reminders', cron: '0 15 * * *' }
  { name: 'food-graph', path: '/api/cron/food-graph', cron: '0 8 * * *' }
  { name: 'erasure-backlog', path: '/api/cron/erasure-backlog', cron: '0 9 * * *' }
  { name: 'dietary-retention', path: '/api/cron/dietary-retention', cron: '0 10 * * *' }
]
var secrets = [for secret in secretReferences: {
  name: secret.name
  keyVaultUrl: secret.keyVaultUrl
  identity: identityId
}]
var registry = [{
  server: registryServer
  identity: identityId
}]
var image = '${imageRepository}@sha256:${imageDigest}'
var publicVariables = [for item in items(publicEnvironment): { name: item.key, value: string(item.value) }]
var secretVariables = [for secret in secretReferences: { name: secret.envName, secretRef: secret.name }]
var cronReferences = filter(secretReferences, secret => secret.envName == 'CRON_SECRET')
var cronSecrets = [for secret in cronReferences: {
  name: secret.name
  keyVaultUrl: secret.keyVaultUrl
  identity: identityId
}]
var cronVariables = [for secret in cronReferences: { name: secret.envName, secretRef: secret.name }]
var environment = concat(
  publicVariables,
  secretVariables,
  [
    { name: 'SOURCE_REVISION', value: sourceRevision }
    { name: 'APP_ENV', value: 'production' }
    { name: 'HOST_PROVIDER', value: 'azure' }
    { name: 'CRON_OWNER', value: schedulerOwner }
  ]
)

resource app 'Microsoft.App/containerApps@2025-01-01' = {
  name: name
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identityId}': {} }
  }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      secrets: secrets
      registries: registry
      ingress: {
        external: true
        targetPort: 3000
        allowInsecure: false
        transport: 'auto'
      }
    }
    template: {
      containers: [{
        name: 'web'
        image: image
        env: environment
        resources: { cpu: json('0.5'), memory: '1Gi' }
        probes: [
          {
            type: 'Startup'
            httpGet: { path: '/api/health/live', port: 3000, scheme: 'HTTP' }
            periodSeconds: 30
            failureThreshold: 10
          }
          {
            type: 'Liveness'
            httpGet: { path: '/api/health/live', port: 3000, scheme: 'HTTP' }
            periodSeconds: 30
            failureThreshold: 3
          }
          {
            type: 'Readiness'
            httpGet: { path: '/api/health', port: 3000, scheme: 'HTTP' }
            timeoutSeconds: 5
            periodSeconds: 30
            failureThreshold: 3
          }
        ]
      }]
      scale: { minReplicas: minReplicas, maxReplicas: 1 }
    }
  }
}

resource jobs 'Microsoft.App/jobs@2025-01-01' = [for schedule in schedules: {
  name: '${name}-${schedule.name}'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identityId}': {} }
  }
  properties: {
    environmentId: environmentId
    configuration: union({
      triggerType: enableSchedules && schedulerOwner == 'azure' ? 'Schedule' : 'Manual'
      replicaTimeout: 600
      replicaRetryLimit: 0
      registries: registry
      secrets: cronSecrets
    }, enableSchedules && schedulerOwner == 'azure' ? {
      scheduleTriggerConfig: {
        cronExpression: schedule.cron
        parallelism: 1
        replicaCompletionCount: 1
      }
    } : {
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
    })
    template: {
      containers: [{
        name: 'scheduler'
        image: image
        command: ['node', 'scripts/cron-runner.mjs', schedule.path]
        env: concat(cronVariables, [
          { name: 'SOURCE_REVISION', value: sourceRevision }
          { name: 'CRON_OWNER', value: schedulerOwner }
          { name: 'CRON_TARGET_ORIGIN', value: 'https://${app.properties.configuration.ingress.fqdn}' }
        ])
        resources: { cpu: json('0.25'), memory: '0.5Gi' }
      }]
    }
  }
}]

output preparedOrigin string = 'https://${app.properties.configuration.ingress.fqdn}'
