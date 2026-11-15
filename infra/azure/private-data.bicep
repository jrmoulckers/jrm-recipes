targetScope = 'resourceGroup'

param location string
@minLength(3)
param virtualNetworkName string
@description('Reviewed non-overlapping IPv4 address space; validate routing and outbound requirements before provisioning.')
@minLength(9)
param virtualNetworkCidr string
@minLength(1)
param appSubnetName string
@description('Exclusive Microsoft.App/environments subnet, /27 or larger for workload profiles.')
@minLength(9)
param appSubnetCidr string
@minLength(1)
param postgresSubnetName string
@description('Exclusive Microsoft.DBforPostgreSQL/flexibleServers subnet, /28 or larger; must not overlap ACA.')
@minLength(9)
param postgresSubnetCidr string
@minLength(3)
param environmentName string
@description('New, separately approved ACA managed infrastructure resource group; Azure creates billed LB/IP infrastructure here.')
@minLength(3)
param infrastructureResourceGroupName string
@description('New globally unique PostgreSQL server name; actual regional SKU/API availability remains unverified.')
@minLength(3)
@maxLength(63)
param postgresServerName string
@description('Reviewed private DNS zone ending .postgres.database.azure.com; not the server hostname.')
@minLength(30)
param postgresPrivateDnsZoneName string
@minLength(1)
param postgresAdministratorLogin string
@secure()
@minLength(8)
param postgresAdministratorPassword string
@description('Explicit storage review input. 32 GiB is proposed, not selected; validate SKU/storage compatibility.')
@minValue(32)
param postgresStorageSizeGB int
@description('Explicit backup-redundancy review input; availability must be checked before approval.')
@allowed(['Enabled', 'Disabled'])
param geoRedundantBackup string

resource network 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: virtualNetworkName
  location: location
  properties: {
    addressSpace: { addressPrefixes: [virtualNetworkCidr] }
    subnets: [
      {
        name: appSubnetName
        properties: {
          addressPrefix: appSubnetCidr
          delegations: [{
            name: 'container-apps'
            properties: { serviceName: 'Microsoft.App/environments' }
          }]
        }
      }
      {
        name: postgresSubnetName
        properties: {
          addressPrefix: postgresSubnetCidr
          delegations: [{
            name: 'postgres'
            properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' }
          }]
        }
      }
    ]
  }
}

resource dns 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: postgresPrivateDnsZoneName
  location: 'global'
}
resource dnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: dns
  name: '${virtualNetworkName}-postgres'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: network.id }
  }
}
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: postgresServerName
  location: location
  sku: { name: 'Standard_B2s', tier: 'Burstable' }
  properties: {
    version: '15'
    administratorLogin: postgresAdministratorLogin
    administratorLoginPassword: postgresAdministratorPassword
    storage: { storageSizeGB: postgresStorageSizeGB }
    backup: { backupRetentionDays: 7, geoRedundantBackup: geoRedundantBackup }
    highAvailability: { mode: 'Disabled' }
    network: {
      delegatedSubnetResourceId: resourceId('Microsoft.Network/virtualNetworks/subnets', virtualNetworkName, postgresSubnetName)
      privateDnsZoneArmResourceId: dns.id
      publicNetworkAccess: 'Disabled'
    }
    authConfig: { passwordAuth: 'Enabled', activeDirectoryAuth: 'Disabled' }
  }
  dependsOn: [dnsLink]
}
resource extensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: postgres
  name: 'azure.extensions'
  properties: {
    value: 'PG_TRGM,PGCRYPTO'
    source: 'user-override'
  }
}
resource environment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: environmentName
  location: location
  properties: {
    infrastructureResourceGroup: infrastructureResourceGroupName
    vnetConfiguration: {
      infrastructureSubnetId: resourceId('Microsoft.Network/virtualNetworks/subnets', virtualNetworkName, appSubnetName)
      internal: false
    }
    workloadProfiles: [{
      name: 'Consumption'
      workloadProfileType: 'Consumption'
    }]
  }
  dependsOn: [network]
}

output environmentId string = environment.id
output postgresFqdn string = postgres.properties.fullyQualifiedDomainName
