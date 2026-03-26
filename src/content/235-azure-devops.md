# Azure DevOps Pipelines

*Chapter 15.6 — Azure DevOps Pipelines*

## Overview

Azure DevOps Pipelines automate building, testing, and deploying your .NET applications.
For Data Engineers at BNBuilders (a Microsoft shop), Azure DevOps is the CI/CD platform
that ensures every pipeline change is tested before reaching production, and every deployment
is repeatable and auditable.

This lesson covers:

- **YAML pipelines** — Defining build/test/publish stages as code.
- **Multi-stage pipelines** — Build once, deploy to dev/staging/production.
- **Variable groups and secrets** — Managing configuration across environments.
- **Automated testing** — Running unit and integration tests in CI.
- **Deploying to Azure** — App Service, Azure Functions, and Container Apps.
- **Release pipelines vs multi-stage YAML** — Classic vs modern approaches.

YAML pipelines are the modern approach. Classic (GUI-based) release pipelines still work
but are no longer the recommended path. New projects should use multi-stage YAML exclusively.

## Core Concepts

### Pipeline Structure

```yaml
# azure-pipelines.yml — lives in your repo root

trigger:          # When does the pipeline run?
pool:             # What machine runs it?
variables:        # Shared variables
stages:           # Ordered list of stages
  - stage: Build  # Each stage has jobs
    jobs:
      - job: BuildJob
        steps:    # Each job has steps (tasks)
          - task: UseDotNet@2
          - script: dotnet build
```

### Key Concepts

| Concept | What It Is | Scope |
|---------|-----------|-------|
| **Trigger** | Event that starts the pipeline | Pipeline-level |
| **Stage** | Major phase (Build, Test, Deploy) | Contains jobs |
| **Job** | Unit of work on a single agent | Contains steps |
| **Step** | Individual command or task | Smallest unit |
| **Pool** | Set of agents (machines) | Per job |
| **Variable** | Key-value pair for configuration | Pipeline, stage, or job |
| **Variable Group** | Shared variables across pipelines | Library level |
| **Environment** | Deployment target with approvals | Stage level |
| **Artifact** | Build output passed between stages | Pipeline level |

### Triggers

```yaml
# Trigger on push to main or release branches
trigger:
  branches:
    include:
      - main
      - release/*
  paths:
    include:
      - src/**
      - tests/**
    exclude:
      - docs/**
      - '**/*.md'

# Trigger on pull request (for validation)
pr:
  branches:
    include:
      - main
  paths:
    include:
      - src/**
      - tests/**
```

## Code Examples

### Complete Multi-Stage Pipeline

```yaml
# azure-pipelines.yml
trigger:
  branches:
    include:
      - main
      - release/*

pr:
  branches:
    include:
      - main

pool:
  vmImage: 'ubuntu-latest'

variables:
  buildConfiguration: 'Release'
  dotnetVersion: '10.0.x'

stages:
  # ─── BUILD STAGE ───────────────────────────────────────────
  - stage: Build
    displayName: 'Build & Test'
    jobs:
      - job: BuildJob
        displayName: 'Build, Test, Publish'
        steps:
          - task: UseDotNet@2
            displayName: 'Install .NET SDK'
            inputs:
              version: $(dotnetVersion)
              includePreviewVersions: false

          - task: DotNetCoreCLI@2
            displayName: 'Restore packages'
            inputs:
              command: 'restore'
              projects: '**/*.csproj'

          - task: DotNetCoreCLI@2
            displayName: 'Build solution'
            inputs:
              command: 'build'
              projects: '**/*.csproj'
              arguments: '--configuration $(buildConfiguration) --no-restore'

          - task: DotNetCoreCLI@2
            displayName: 'Run unit tests'
            inputs:
              command: 'test'
              projects: '**/Tests.Unit/*.csproj'
              arguments: >-
                --configuration $(buildConfiguration)
                --no-build
                --logger trx
                --collect:"XPlat Code Coverage"

          - task: PublishTestResults@2
            displayName: 'Publish test results'
            condition: always()
            inputs:
              testResultsFormat: 'VSTest'
              testResultsFiles: '**/*.trx'
              mergeTestResults: true

          - task: PublishCodeCoverageResults@2
            displayName: 'Publish code coverage'
            condition: always()
            inputs:
              summaryFileLocation: '**/coverage.cobertura.xml'

          - task: DotNetCoreCLI@2
            displayName: 'Publish application'
            inputs:
              command: 'publish'
              publishWebProjects: false
              projects: 'src/BNBuilders.CostSync/BNBuilders.CostSync.csproj'
              arguments: >-
                --configuration $(buildConfiguration)
                --output $(Build.ArtifactStagingDirectory)/app
              zipAfterPublish: true

          - task: PublishPipelineArtifact@1
            displayName: 'Upload artifact'
            inputs:
              targetPath: '$(Build.ArtifactStagingDirectory)/app'
              artifact: 'drop'
              publishLocation: 'pipeline'

  # ─── DEPLOY TO DEV ─────────────────────────────────────────
  - stage: DeployDev
    displayName: 'Deploy to Dev'
    dependsOn: Build
    condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))
    jobs:
      - deployment: DeployDevJob
        displayName: 'Deploy to Dev App Service'
        environment: 'Development'
        strategy:
          runOnce:
            deploy:
              steps:
                - task: AzureWebApp@1
                  displayName: 'Deploy to Azure App Service'
                  inputs:
                    azureSubscription: 'BNBuilders-Dev'
                    appType: 'webApp'
                    appName: 'bnbuilders-costsync-dev'
                    package: '$(Pipeline.Workspace)/drop/**/*.zip'

  # ─── INTEGRATION TESTS ─────────────────────────────────────
  - stage: IntegrationTests
    displayName: 'Integration Tests'
    dependsOn: DeployDev
    jobs:
      - job: RunIntegrationTests
        displayName: 'Run integration tests against Dev'
        variables:
          - group: 'BNBuilders-Dev-Secrets'
        steps:
          - task: UseDotNet@2
            inputs:
              version: $(dotnetVersion)

          - task: DotNetCoreCLI@2
            displayName: 'Run integration tests'
            inputs:
              command: 'test'
              projects: '**/Tests.Integration/*.csproj'
              arguments: >-
                --configuration $(buildConfiguration)
                --logger trx
            env:
              ConnectionStrings__AzureSql: $(AzureSql-ConnectionString)
              BlobStorage__ConnectionString: $(BlobStorage-ConnectionString)

  # ─── DEPLOY TO PRODUCTION ──────────────────────────────────
  - stage: DeployProd
    displayName: 'Deploy to Production'
    dependsOn: IntegrationTests
    condition: and(succeeded(), startsWith(variables['Build.SourceBranch'], 'refs/heads/release/'))
    jobs:
      - deployment: DeployProdJob
        displayName: 'Deploy to Production'
        environment: 'Production'  # Requires manual approval
        strategy:
          runOnce:
            deploy:
              steps:
                - task: AzureWebApp@1
                  displayName: 'Deploy to Production App Service'
                  inputs:
                    azureSubscription: 'BNBuilders-Prod'
                    appType: 'webApp'
                    appName: 'bnbuilders-costsync-prod'
                    package: '$(Pipeline.Workspace)/drop/**/*.zip'
                    deploymentMethod: 'zipDeploy'
```

### Variable Groups

```yaml
# Reference a variable group defined in Azure DevOps Library
variables:
  - group: 'BNBuilders-Common'        # Shared across all pipelines
  - group: 'BNBuilders-Dev-Secrets'    # Environment-specific (linked to Key Vault)
  - name: buildConfiguration
    value: 'Release'
```

Setting up a Key Vault-linked variable group:

```bash
# Create a variable group linked to Key Vault
# (Usually done in the Azure DevOps UI: Pipelines > Library > + Variable group)
#
# Steps:
# 1. Name: "BNBuilders-Prod-Secrets"
# 2. Toggle "Link secrets from an Azure key vault"
# 3. Select subscription and vault
# 4. Select which secrets to include
# 5. Authorize the pipeline to use this group
```

### Deploying Azure Functions

```yaml
# Deploy a data pipeline Azure Function
- stage: DeployFunction
  displayName: 'Deploy Pipeline Function'
  jobs:
    - deployment: DeployFunc
      environment: 'Production'
      strategy:
        runOnce:
          deploy:
            steps:
              - task: AzureFunctionApp@2
                displayName: 'Deploy to Azure Functions'
                inputs:
                  azureSubscription: 'BNBuilders-Prod'
                  appType: 'functionApp'
                  appName: 'bnbuilders-pipeline-functions'
                  package: '$(Pipeline.Workspace)/drop/functions.zip'
                  runtimeStack: 'DOTNET-ISOLATED|10.0'
```

### Deploying to Azure Container Apps

```yaml
# Build container and deploy to Container Apps
- stage: DeployContainer
  displayName: 'Deploy Container'
  jobs:
    - deployment: DeployContainerJob
      environment: 'Production'
      strategy:
        runOnce:
          deploy:
            steps:
              - task: Docker@2
                displayName: 'Build and push image'
                inputs:
                  containerRegistry: 'bnbuilders-acr'
                  repository: 'costsync'
                  command: 'buildAndPush'
                  Dockerfile: 'src/BNBuilders.CostSync/Dockerfile'
                  tags: |
                    $(Build.BuildId)
                    latest

              - task: AzureCLI@2
                displayName: 'Update Container App'
                inputs:
                  azureSubscription: 'BNBuilders-Prod'
                  scriptType: 'bash'
                  scriptLocation: 'inlineScript'
                  inlineScript: |
                    az containerapp update \
                      --name costsync \
                      --resource-group bnbuilders-rg \
                      --image bnbuildersacr.azurecr.io/costsync:$(Build.BuildId)
```

### Running Database Migrations

```yaml
# EF Core migrations in the pipeline
- stage: MigrateDatabase
  displayName: 'Run Database Migrations'
  dependsOn: Build
  jobs:
    - deployment: MigrateJob
      environment: 'Development'
      variables:
        - group: 'BNBuilders-Dev-Secrets'
      strategy:
        runOnce:
          deploy:
            steps:
              - task: UseDotNet@2
                inputs:
                  version: $(dotnetVersion)

              # Install EF Core tools
              - script: dotnet tool install --global dotnet-ef
                displayName: 'Install EF Core tools'

              # Run migrations
              - script: |
                  dotnet ef database update \
                    --project src/BNBuilders.Data/BNBuilders.Data.csproj \
                    --startup-project src/BNBuilders.CostSync/BNBuilders.CostSync.csproj \
                    --connection "$(AzureSql-ConnectionString)"
                displayName: 'Apply EF migrations'
```

### Scheduled Pipeline (Nightly Build)

```yaml
# Run nightly to validate the codebase
schedules:
  - cron: '0 6 * * *'  # 6 AM UTC = 10 PM PST
    displayName: 'Nightly build'
    branches:
      include:
        - main
    always: true  # Run even if no code changes
```

## Common Patterns

### Pipeline Templates for Reuse

```yaml
# templates/build-dotnet.yml — reusable build template
parameters:
  - name: project
    type: string
  - name: buildConfiguration
    type: string
    default: 'Release'
  - name: dotnetVersion
    type: string
    default: '10.0.x'

steps:
  - task: UseDotNet@2
    displayName: 'Install .NET SDK'
    inputs:
      version: ${{ parameters.dotnetVersion }}

  - task: DotNetCoreCLI@2
    displayName: 'Restore'
    inputs:
      command: 'restore'
      projects: '${{ parameters.project }}'

  - task: DotNetCoreCLI@2
    displayName: 'Build'
    inputs:
      command: 'build'
      projects: '${{ parameters.project }}'
      arguments: '--configuration ${{ parameters.buildConfiguration }} --no-restore'

  - task: DotNetCoreCLI@2
    displayName: 'Test'
    inputs:
      command: 'test'
      projects: '${{ parameters.project }}'
      arguments: '--configuration ${{ parameters.buildConfiguration }} --no-build --logger trx'
```

```yaml
# azure-pipelines.yml — use the template
stages:
  - stage: Build
    jobs:
      - job: Build
        steps:
          - template: templates/build-dotnet.yml
            parameters:
              project: 'src/BNBuilders.CostSync/BNBuilders.CostSync.csproj'
```

### Release Pipelines vs Multi-Stage YAML

| Feature | Classic Release Pipeline | Multi-Stage YAML |
|---------|------------------------|-----------------|
| Definition | GUI-based | Code in repo |
| Version control | Not tracked | Git history |
| Code review | Not possible | PR reviews |
| Reusability | Task groups | Templates |
| Environments | Stages | Environments |
| Approvals | Pre/post deployment | Environment checks |
| Rollback | Redeploy previous release | Rerun previous build |
| Recommended | Legacy pipelines only | All new projects |

### Branch Strategy for Data Pipelines

```
main (production-ready)
├── feature/add-procore-sync    (developer branch)
├── feature/update-cost-report  (developer branch)
└── release/2026.03             (release candidate)

Pipeline rules:
  PR to main       → Build + Unit Tests (validation)
  Push to main     → Build + Test + Deploy to Dev
  Push to release/ → Build + Test + Deploy to Dev + Deploy to Prod (with approval)
```

## Gotchas and Pitfalls

1. **Secrets in logs** — Pipeline variables marked as secret are masked in logs, but
   `System.Debug` and certain error messages can still leak them. Never `echo` secrets.

2. **Agent pool timeouts** — Microsoft-hosted agents have a 6-hour job timeout (1 hour for
   free tier). For long-running integration tests, use self-hosted agents.

3. **Artifact expiration** — Pipeline artifacts expire after 30 days by default. If you need
   to redeploy an old version, increase retention or use Azure Container Registry.

4. **YAML indentation** — YAML is whitespace-sensitive. Use 2-space indentation consistently.
   A single tab character breaks the entire pipeline. Use VS Code with a YAML extension.

5. **Variable group permissions** — Variable groups must be explicitly authorized for each
   pipeline. Forgetting this causes "access denied" errors at runtime.

6. **Deployment slots** — When deploying to App Service, use deployment slots for zero-
   downtime deployments. Deploy to a staging slot, warm it up, then swap:

```yaml
- task: AzureWebApp@1
  inputs:
    deployToSlotOrASE: true
    slotName: 'staging'

- task: AzureAppServiceManage@0
  inputs:
    action: 'Swap Slots'
    sourceSlot: 'staging'
```

7. **Pipeline caching** — Speed up builds by caching NuGet packages:

```yaml
- task: Cache@2
  displayName: 'Cache NuGet packages'
  inputs:
    key: 'nuget | "$(Agent.OS)" | **/packages.lock.json'
    restoreKeys: |
      nuget | "$(Agent.OS)"
    path: '$(NUGET_PACKAGES)'
```

8. **Self-hosted agent maintenance** — If BNBuilders uses self-hosted agents for on-prem
   access (Sage 300), keep them updated. Outdated agents miss security patches and may
   lack support for newer pipeline features.

## Performance Considerations

- **Parallel jobs** — The free tier includes 1 parallel job. Purchase additional parallel
  jobs to run stages concurrently. Each costs ~$40/month.

- **Caching** — Cache NuGet packages, npm modules, and build outputs. This can reduce
  restore time from 2 minutes to 10 seconds.

- **Docker layer caching** — Use `docker buildx` with cache to avoid rebuilding unchanged
  layers.

- **Pipeline duration targets** — Aim for:
  - Build + Unit Tests: < 5 minutes
  - Integration Tests: < 15 minutes
  - Full pipeline (Build → Prod): < 30 minutes (plus approval wait)

- **Agent selection** — `ubuntu-latest` is the fastest Microsoft-hosted agent. `windows-
  latest` is slower due to larger image size. Use Linux unless you need Windows-specific
  features.

- **Conditional stages** — Use conditions to skip unnecessary stages:

```yaml
# Only deploy on main branch
condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))

# Skip tests if only docs changed
condition: not(contains(variables['Build.SourceVersionMessage'], '[skip-tests]'))
```

## BNBuilders Context

### Pipeline Portfolio

| Pipeline | Trigger | Stages | Purpose |
|----------|---------|--------|---------|
| CostSync CI/CD | Push to main | Build, Test, Deploy Dev, Deploy Prod | Main data pipeline |
| Procore Integration | Push to main | Build, Test, Deploy Function | Procore API sync |
| Power BI Refresh | Schedule (after CostSync) | Run refresh script | Dashboard updates |
| Data Quality Checks | Schedule (daily 6 AM) | Run tests against prod SQL | Validate data |
| CLI Tools | Tag push | Build AOT, Publish artifacts | Team tooling |
| Infrastructure | Push to infra/* | Terraform plan/apply | Azure resources |

### Approval Workflow

```
Developer → Push to feature branch
         → PR to main (triggers validation pipeline)
         → Code review + test results
         → Merge to main
         → Auto-deploy to Dev
         → Automated integration tests
         → Manual approval by Tech Lead
         → Auto-deploy to Production
```

Setting up environment approvals:

```
Azure DevOps → Environments → Production → Approvals and checks
  → Add check → Approvals
    → Approvers: Tech Lead, Data Engineering Manager
    → Timeout: 48 hours
    → Instructions: "Verify integration tests passed and review deployment diff"
```

### Service Connection Setup

```bash
# Create a service connection for Azure (done in Azure DevOps UI)
# Project Settings → Service Connections → New → Azure Resource Manager
#
# Options:
# 1. Automatic (recommended) — creates a service principal
# 2. Manual — use existing service principal
# 3. Managed Identity — for self-hosted agents on Azure VMs
#
# Scope: Subscription or Resource Group level
# Name: "BNBuilders-Prod" (referenced in YAML as azureSubscription)
```

### Monitoring Deployments

```yaml
# Post-deployment health check
- task: AzureCLI@2
  displayName: 'Verify deployment health'
  inputs:
    azureSubscription: 'BNBuilders-Prod'
    scriptType: 'bash'
    inlineScript: |
      # Check if the app is responding
      STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        https://bnbuilders-costsync-prod.azurewebsites.net/health)

      if [ "$STATUS" != "200" ]; then
        echo "##vso[task.logissue type=error]Health check failed: HTTP $STATUS"
        exit 1
      fi

      echo "Health check passed: HTTP $STATUS"
```

## Interview / Senior Dev Questions

1. **Q: Why use multi-stage YAML pipelines instead of classic release pipelines?**
   A: Multi-stage YAML is defined as code in the repository, so it is version-controlled,
   code-reviewable via PRs, and follows the same branch strategy as the application. Classic
   release pipelines are configured in the UI, have no Git history, and cannot be reviewed
   in pull requests. YAML also supports templates for reuse across projects.

2. **Q: How do you handle secrets in Azure DevOps pipelines?**
   A: Use variable groups linked to Azure Key Vault. Secrets are fetched at runtime, never
   stored in YAML files or pipeline variables. Mark pipeline variables as "secret" to mask
   them in logs. Use service connections with managed identity for Azure authentication.

3. **Q: Describe a deployment strategy that minimizes risk for a data pipeline.**
   A: Build once and promote the same artifact through environments: Dev → Staging → Prod.
   Use deployment slots for zero-downtime swaps. Require manual approval for production.
   Run integration tests against the Dev deployment before promoting. Include a health check
   after each deployment. Keep the previous deployment ready for rollback.

4. **Q: How would you set up CI for a data pipeline that needs a database for integration
   tests?**
   A: Two approaches: (a) Use a variable group linked to Key Vault containing a test database
   connection string. Run integration tests against a dedicated test database in Azure SQL
   (serverless tier to minimize cost). (b) Use Docker Compose in the pipeline to spin up a
   SQL Server container for isolated testing.

## Quiz

**Question 1:** What is the recommended approach for defining pipelines in Azure DevOps?

a) Classic release pipelines (GUI-based)
b) Multi-stage YAML pipelines (code in repo)
c) PowerShell scripts triggered manually
d) Azure Logic Apps

<details>
<summary>Answer</summary>

**b) Multi-stage YAML pipelines.** YAML pipelines are defined as code, version-controlled,
reviewable in PRs, and support templates for reuse. Classic release pipelines still work but
are not recommended for new projects.

</details>

**Question 2:** How should production secrets (like connection strings) be provided to a
pipeline?

a) Hardcoded in the YAML file
b) Stored in `appsettings.json` in the repo
c) Variable groups linked to Azure Key Vault
d) Passed as command-line arguments

<details>
<summary>Answer</summary>

**c) Variable groups linked to Azure Key Vault.** This keeps secrets out of source control
and pipeline definitions. Secrets are fetched at runtime from Key Vault and masked in logs.
Variable groups can be shared across pipelines and scoped to environments.

</details>

**Question 3:** What is the purpose of an "environment" in Azure DevOps Pipelines?

a) It defines which operating system the agent uses
b) It represents a deployment target with optional approval checks and history
c) It sets environment variables for the build
d) It selects the Azure subscription

<details>
<summary>Answer</summary>

**b) It represents a deployment target with optional approval checks and history.**
Environments (like "Development", "Production") can have approval gates, deployment history,
and health checks. When a stage targets an environment with required approvals, the pipeline
pauses until an authorized person approves.

</details>

**Question 4:** Your build pipeline takes 12 minutes. What is the most effective way to
reduce it?

a) Use a faster Azure DevOps tier
b) Cache NuGet packages and use parallel jobs for independent stages
c) Remove all tests
d) Deploy without building

<details>
<summary>Answer</summary>

**b) Cache NuGet packages and use parallel jobs.** NuGet restore often takes 1-3 minutes and
can be reduced to seconds with caching. Running independent stages (like unit tests and
linting) in parallel reduces total wall time. Never skip tests — they are the safety net.

</details>

**Question 5:** You want production deployments to require manager approval. How do you
configure this?

a) Add a `condition` in YAML that checks for an approval variable
b) Configure approval checks on the "Production" environment in Azure DevOps
c) Use a manual trigger for the production stage
d) Send an email from the pipeline and wait for a reply

<details>
<summary>Answer</summary>

**b) Configure approval checks on the "Production" environment.** In Azure DevOps, navigate
to Environments, select "Production", and add an Approvals check. Specify the approvers and
timeout. When the pipeline reaches the production deployment stage, it pauses until an
approver reviews and approves.

</details>
