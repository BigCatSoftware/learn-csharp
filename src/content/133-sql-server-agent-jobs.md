# SQL Server Agent Jobs

*Chapter 9.14 — T-SQL for Data Engineers*

## Overview

SQL Server Agent is the built-in job scheduler for SQL Server. It runs background tasks on
schedules, responds to alerts, and chains multi-step workflows — making it the backbone of
ETL automation on any Microsoft SQL Server installation.

For Data Engineers, Agent Jobs handle:

- **Scheduled ETL**: Nightly Oracle-to-SQL Server extracts, staging loads, warehouse refreshes.
- **Maintenance**: Index rebuilds, statistics updates, log backups.
- **Monitoring**: Alert on long-running queries, disk space thresholds, job failures.
- **Orchestration**: Multi-step jobs with conditional branching — step 2 only runs if step 1
  succeeds, step 3 runs a cleanup regardless.

Agent is available in Standard and Enterprise editions (not Express). All Agent metadata lives
in the `msdb` system database.

This lesson covers job creation, step configuration, schedules, alerts, notifications, proxy
accounts, and the msdb system tables that let you query job history programmatically.

---

## Core Concepts

### Agent Architecture

| Component | Purpose |
|---|---|
| **Job** | A named unit of work with one or more steps |
| **Step** | A single action (T-SQL, SSIS, PowerShell, CmdExec, etc.) |
| **Schedule** | When a job runs (recurring, one-time, on-demand) |
| **Alert** | Triggered by an event (error, performance condition, WMI event) |
| **Notification** | Email/page/net send when a job completes, fails, or succeeds |
| **Operator** | A named contact for notifications (email address) |
| **Proxy** | A credential wrapper letting a step run under a non-Agent account |

### Step Types

| Type | Use Case |
|---|---|
| `TSQL` | Run T-SQL statements (most common for DE work) |
| `SSIS` | Execute an SSIS package from the catalog or filesystem |
| `CmdExec` | Run a Windows command or batch script |
| `PowerShell` | Run PowerShell scripts |
| `ActiveScripting` | Legacy (VBScript/JScript) — avoid |

### Job Flow Control

Each step has an "on success" and "on failure" action:

- **Go to the next step**
- **Go to a specific step** (by step ID)
- **Quit the job reporting success**
- **Quit the job reporting failure**

This enables conditional branching: if the extract step fails, skip the transform and jump
to a notification/cleanup step.

---

## Code Examples

### Creating a Simple Job with T-SQL

```sql
USE msdb;
GO

-- Step 1: Create the job
EXEC sp_add_job
    @job_name = N'ETL_NightlyJobCostLoad',
    @description = N'Nightly load of job cost data from Oracle staging to warehouse',
    @category_name = N'Data Collector',
    @owner_login_name = N'sa',
    @enabled = 1;

-- Step 2: Add a T-SQL step
EXEC sp_add_jobstep
    @job_name = N'ETL_NightlyJobCostLoad',
    @step_name = N'Step1_TruncateStaging',
    @step_id = 1,
    @subsystem = N'TSQL',
    @command = N'TRUNCATE TABLE staging.OracleJobCosts;',
    @database_name = N'BNBuildersDB',
    @on_success_action = 3,    -- Go to next step
    @on_fail_action = 2;       -- Quit with failure

-- Step 3: Add the load step
EXEC sp_add_jobstep
    @job_name = N'ETL_NightlyJobCostLoad',
    @step_name = N'Step2_LoadFromOracle',
    @step_id = 2,
    @subsystem = N'TSQL',
    @command = N'
        INSERT INTO staging.OracleJobCosts WITH (TABLOCK)
        SELECT *
        FROM OPENQUERY(ORACLE_LINKED_SVR,
            ''SELECT job_number, cost_code, budget_amt, actual_amt
              FROM cmic.job_costs
              WHERE last_modified > SYSDATE - 1'');
    ',
    @database_name = N'BNBuildersDB',
    @on_success_action = 3,
    @on_fail_action = 2;

-- Step 4: Add the merge step
EXEC sp_add_jobstep
    @job_name = N'ETL_NightlyJobCostLoad',
    @step_name = N'Step3_MergeToWarehouse',
    @step_id = 3,
    @subsystem = N'TSQL',
    @command = N'EXEC dbo.usp_MergeJobCosts;',
    @database_name = N'BNBuildersDB',
    @on_success_action = 1,    -- Quit with success
    @on_fail_action = 2;

-- Step 5: Assign the job to the local server
EXEC sp_add_jobserver
    @job_name = N'ETL_NightlyJobCostLoad',
    @server_name = N'(LOCAL)';
```

### Adding a Schedule

```sql
-- Run every weeknight at 2:00 AM
EXEC sp_add_schedule
    @schedule_name = N'Weeknights_2AM',
    @freq_type = 8,            -- Weekly
    @freq_interval = 62,       -- Mon(2)+Tue(4)+Wed(8)+Thu(16)+Fri(32) = 62
    @freq_recurrence_factor = 1,
    @active_start_time = 020000;  -- 02:00:00 in HHMMSS

EXEC sp_attach_schedule
    @job_name = N'ETL_NightlyJobCostLoad',
    @schedule_name = N'Weeknights_2AM';
```

### Schedule Frequency Types Reference

```sql
-- @freq_type values:
--   1  = One time
--   4  = Daily
--   8  = Weekly
--  16  = Monthly (specific day)
--  32  = Monthly (relative: "second Tuesday")
--  64  = Runs when Agent starts
-- 128  = Runs when computer is idle

-- @freq_interval for weekly (@freq_type = 8):
--   Sunday=1, Monday=2, Tuesday=4, Wednesday=8,
--   Thursday=16, Friday=32, Saturday=64
--   Combine with addition: Mon+Wed+Fri = 2+8+32 = 42

-- Daily every 4 hours example:
EXEC sp_add_schedule
    @schedule_name = N'Every4Hours',
    @freq_type = 4,                -- Daily
    @freq_interval = 1,            -- Every 1 day
    @freq_subday_type = 8,         -- Hours
    @freq_subday_interval = 4,     -- Every 4 hours
    @active_start_time = 060000,   -- Starting at 6 AM
    @active_end_time = 220000;     -- Until 10 PM
```

### Creating an Operator for Notifications

```sql
EXEC sp_add_operator
    @name = N'DataEngineering_Team',
    @enabled = 1,
    @email_address = N'data-engineering@bnbuilders.com';

-- Notify on job failure
EXEC sp_update_job
    @job_name = N'ETL_NightlyJobCostLoad',
    @notify_level_email = 2,               -- On failure
    @notify_email_operator_name = N'DataEngineering_Team';
```

### Multi-Step Job with Conditional Flow

```sql
-- Job: Weekend Warehouse Full Refresh
-- Step 1: Disable indexes  -> on success: step 2, on failure: step 5 (cleanup)
-- Step 2: Truncate facts   -> on success: step 3, on failure: step 5
-- Step 3: Load facts       -> on success: step 4, on failure: step 5
-- Step 4: Rebuild indexes  -> on success: quit success, on failure: step 5
-- Step 5: Send alert email -> always: quit failure

EXEC sp_add_job @job_name = N'DW_WeekendFullRefresh',
    @description = N'Full data warehouse refresh every Saturday';

EXEC sp_add_jobstep @job_name = N'DW_WeekendFullRefresh',
    @step_name = N'DisableIndexes', @step_id = 1,
    @subsystem = N'TSQL',
    @command = N'ALTER INDEX ALL ON dw.FactJobCost DISABLE;',
    @database_name = N'BNBuildersDB',
    @on_success_action = 3,       -- next step
    @on_fail_action = 4,          -- go to step...
    @on_fail_step_id = 5;         -- ...step 5

EXEC sp_add_jobstep @job_name = N'DW_WeekendFullRefresh',
    @step_name = N'TruncateFacts', @step_id = 2,
    @subsystem = N'TSQL',
    @command = N'TRUNCATE TABLE dw.FactJobCost;',
    @database_name = N'BNBuildersDB',
    @on_success_action = 3,
    @on_fail_action = 4, @on_fail_step_id = 5;

EXEC sp_add_jobstep @job_name = N'DW_WeekendFullRefresh',
    @step_name = N'LoadFacts', @step_id = 3,
    @subsystem = N'TSQL',
    @command = N'EXEC dbo.usp_LoadFactJobCost;',
    @database_name = N'BNBuildersDB',
    @on_success_action = 3,
    @on_fail_action = 4, @on_fail_step_id = 5;

EXEC sp_add_jobstep @job_name = N'DW_WeekendFullRefresh',
    @step_name = N'RebuildIndexes', @step_id = 4,
    @subsystem = N'TSQL',
    @command = N'
        ALTER INDEX ALL ON dw.FactJobCost REBUILD
            WITH (DATA_COMPRESSION = PAGE);
        UPDATE STATISTICS dw.FactJobCost;
    ',
    @database_name = N'BNBuildersDB',
    @on_success_action = 1,       -- quit with success
    @on_fail_action = 4, @on_fail_step_id = 5;

EXEC sp_add_jobstep @job_name = N'DW_WeekendFullRefresh',
    @step_name = N'SendFailureAlert', @step_id = 5,
    @subsystem = N'TSQL',
    @command = N'
        EXEC msdb.dbo.sp_send_dbmail
            @profile_name = ''SQLAlerts'',
            @recipients = ''data-engineering@bnbuilders.com'',
            @subject = ''DW_WeekendFullRefresh FAILED'',
            @body = ''The weekend warehouse refresh failed. Check job history.'';
    ',
    @database_name = N'msdb',
    @on_success_action = 2,       -- quit with failure (job still failed)
    @on_fail_action = 2;

EXEC sp_add_jobserver @job_name = N'DW_WeekendFullRefresh', @server_name = N'(LOCAL)';

-- Saturday at 1 AM
EXEC sp_add_schedule @schedule_name = N'Saturday_1AM',
    @freq_type = 8, @freq_interval = 64,   -- Saturday
    @freq_recurrence_factor = 1,
    @active_start_time = 010000;

EXEC sp_attach_schedule
    @job_name = N'DW_WeekendFullRefresh',
    @schedule_name = N'Saturday_1AM';
```

### SSIS Package Execution from Agent

```sql
-- Execute an SSIS package deployed to the SSIS Catalog
EXEC sp_add_jobstep
    @job_name = N'ETL_NightlyJobCostLoad',
    @step_name = N'RunSSISPackage',
    @step_id = 1,
    @subsystem = N'SSIS',
    @command = N'/ISSERVER "\SSISDB\BNBuilders_ETL\OracleExtract\ExtractJobCosts.dtsx"
        /SERVER "localhost"
        /ENVREFERENCE 3
        /Par "\"$ServerOption::LOGGING_LEVEL(Int16)\";1"',
    @on_success_action = 3,
    @on_fail_action = 2;
```

### Proxy Accounts

```sql
-- Create a credential that maps to a Windows account
CREATE CREDENTIAL CredentialForETL
    WITH IDENTITY = 'BNBUILDERS\svc_etl',
    SECRET = 'P@ssw0rd!';

-- Create a proxy using that credential
EXEC sp_add_proxy
    @proxy_name = N'ETL_Proxy',
    @credential_name = N'CredentialForETL',
    @description = N'Runs ETL steps under the svc_etl domain account';

-- Grant the proxy access to CmdExec subsystem
EXEC sp_grant_proxy_to_subsystem
    @proxy_name = N'ETL_Proxy',
    @subsystem_id = 3;           -- 3 = CmdExec

-- Use the proxy in a job step
EXEC sp_add_jobstep
    @job_name = N'ETL_NightlyJobCostLoad',
    @step_name = N'BCP_Export',
    @subsystem = N'CmdExec',
    @command = N'bcp "SELECT * FROM dbo.JobCosts" queryout "D:\Exports\costs.csv" -S localhost -d BNBuildersDB -T -c -t ","',
    @proxy_name = N'ETL_Proxy',
    @on_success_action = 1,
    @on_fail_action = 2;
```

---

## Common Patterns

### Pattern 1: Querying Job History from msdb

```sql
-- Last run status for all jobs
SELECT
    j.name                       AS JobName,
    CASE h.run_status
        WHEN 0 THEN 'Failed'
        WHEN 1 THEN 'Succeeded'
        WHEN 2 THEN 'Retry'
        WHEN 3 THEN 'Canceled'
        WHEN 4 THEN 'In Progress'
    END                          AS LastStatus,
    msdb.dbo.agent_datetime(h.run_date, h.run_time)  AS LastRunTime,
    h.run_duration               AS Duration_HHMMSS,
    h.message
FROM msdb.dbo.sysjobs AS j
INNER JOIN msdb.dbo.sysjobhistory AS h
    ON j.job_id = h.job_id
WHERE h.step_id = 0             -- step 0 = overall job outcome
ORDER BY h.run_date DESC, h.run_time DESC;
```

### Pattern 2: Finding Failed Jobs in the Last 24 Hours

```sql
SELECT
    j.name AS JobName,
    h.step_name,
    h.message,
    msdb.dbo.agent_datetime(h.run_date, h.run_time) AS FailTime
FROM msdb.dbo.sysjobhistory h
INNER JOIN msdb.dbo.sysjobs j ON j.job_id = h.job_id
WHERE h.run_status = 0          -- Failed
  AND msdb.dbo.agent_datetime(h.run_date, h.run_time) > DATEADD(HOUR, -24, GETDATE())
ORDER BY FailTime DESC;
```

### Pattern 3: Currently Running Jobs

```sql
SELECT
    j.name           AS JobName,
    ja.start_execution_date,
    DATEDIFF(MINUTE, ja.start_execution_date, GETDATE()) AS RunningMinutes,
    js.step_name     AS CurrentStep
FROM msdb.dbo.sysjobactivity ja
INNER JOIN msdb.dbo.sysjobs j ON j.job_id = ja.job_id
LEFT JOIN msdb.dbo.sysjobsteps js
    ON ja.job_id = js.job_id AND ja.last_executed_step_id + 1 = js.step_id
WHERE ja.session_id = (SELECT MAX(session_id) FROM msdb.dbo.syssessions)
  AND ja.start_execution_date IS NOT NULL
  AND ja.stop_execution_date IS NULL;
```

---

## Gotchas and Pitfalls

1. **Agent must be running**. It is a Windows service (`SQLSERVERAGENT`) that can be stopped.
   If it is not running, no jobs fire. Set it to Automatic start.

2. **Job owner matters**. Jobs run under the SQL Server Agent service account by default.
   If a step accesses network resources (UNC paths, linked servers), the service account
   needs permissions — or use a proxy.

3. **T-SQL steps run in their own session**. Variables, temp tables, and session settings
   from step 1 are NOT available in step 2. Each step is a separate connection. Use permanent
   tables or a shared staging schema to pass data between steps.

4. **run_duration format**. The `run_duration` column in `sysjobhistory` stores duration as
   an integer in HHMMSS format (e.g., 12345 means 1 hour, 23 minutes, 45 seconds). Not
   seconds! Parse it carefully.

5. **Job history retention**. By default, Agent keeps only 1000 total history rows and 100
   rows per job. For active systems, this means you lose history quickly. Increase via:
   `EXEC sp_set_sqlagent_properties @jobhistory_max_rows = 10000, @jobhistory_max_rows_per_job = 500;`

6. **CmdExec step failures**. A CmdExec step succeeds when the process exits with code 0.
   If your batch script doesn't explicitly `EXIT /B 0`, agent may report failure even if the
   work completed.

7. **Daylight saving time**. Schedules use the server's local time zone. Jobs scheduled at
   2:00 AM on the spring-forward date may skip or double-fire. Use UTC where possible or
   avoid scheduling in the 1:00-3:00 AM window.

8. **Express Edition**. SQL Server Express does NOT include SQL Server Agent. For Express,
   use Windows Task Scheduler with `sqlcmd` scripts as the alternative.

---

## Performance Considerations

- **Keep job steps focused**. A single step that runs for 6 hours is hard to debug. Break it
  into logical steps (extract, transform, load) so you can see which step is slow from
  job history.

- **Use OUTPUT files**. Each T-SQL step can write output to a file
  (`@output_file_name = N'D:\Logs\step1.txt'`). This captures PRINT statements, row counts,
  and error messages that don't appear in job history.

- **Stagger job schedules**. If you have 10 ETL jobs all scheduled at 2:00 AM, they compete
  for CPU, memory, and I/O. Spread them out: 2:00, 2:15, 2:30, etc.

- **Timeout protection**. Agent does not have a built-in step timeout. Implement one by
  checking elapsed time within the T-SQL script, or wrap CmdExec calls with a timeout
  utility.

- **Monitor with alerts**. Create alerts for error severity 16+ or specific error numbers.
  Agent can respond by running a job (e.g., kill a blocking session) or notifying an operator.

---

## BNBuilders Context

### Nightly Oracle-to-SQL Server ETL

The primary DE workload at BNBuilders: extracting job cost, change order, and commitment
data from Oracle/CMiC into the SQL Server warehouse:

```sql
-- Job: ETL_Oracle_Nightly
-- Step 1: Extract via linked server  (2:00 AM)
-- Step 2: Transform and validate     (depends on step 1)
-- Step 3: Merge into warehouse       (depends on step 2)
-- Step 4: Refresh Power BI dataset   (CmdExec calling PowerShell)
-- Step 5: Email summary to PM team   (sp_send_dbmail)
```

### Weekend Data Warehouse Refresh

Saturday at 1 AM: full refresh of dimension and fact tables. The multi-step conditional
flow pattern (shown in Code Examples) ensures that if the load fails, indexes are not left
in a disabled state without notification.

### Monitoring Job Health

A daily "health check" job runs at 7:00 AM and emails the DE team if any overnight jobs
failed:

```sql
-- Step 1 of HealthCheck job
DECLARE @failures NVARCHAR(MAX) = '';

SELECT @failures = @failures + j.name + ' failed at '
    + CONVERT(NVARCHAR, msdb.dbo.agent_datetime(h.run_date, h.run_time), 120) + CHAR(13)
FROM msdb.dbo.sysjobhistory h
INNER JOIN msdb.dbo.sysjobs j ON j.job_id = h.job_id
WHERE h.run_status = 0 AND h.step_id = 0
  AND msdb.dbo.agent_datetime(h.run_date, h.run_time) > DATEADD(HOUR, -12, GETDATE());

IF LEN(@failures) > 0
BEGIN
    EXEC msdb.dbo.sp_send_dbmail
        @profile_name = 'SQLAlerts',
        @recipients = 'data-engineering@bnbuilders.com',
        @subject = 'Overnight ETL Failures',
        @body = @failures;
END;
```

---

## Interview / Senior Dev Questions

1. **How do you pass data between job steps?**
   Use staging tables, global temp tables (risky — session ends between steps), or token
   replacement macros (`$(ESCAPE_SQUOTE(JOBID))`, `$(ESCAPE_SQUOTE(STEPID))`). Permanent
   staging tables are the most reliable approach.

2. **What is a proxy account and when do you need one?**
   A proxy maps a job step to a Windows credential, letting the step run under a different
   security context than the Agent service account. You need it when a step must access
   resources (file shares, linked servers, SSIS) that the Agent service account cannot reach.

3. **How would you implement job dependency (Job B waits for Job A)?**
   Options: (a) Make Job B a step within Job A. (b) Have Job A's last step call
   `sp_start_job @job_name = 'Job B'`. (c) Use a token table — Job A writes a flag, Job B
   polls or is triggered by an alert. (d) Use an orchestrator like ADF or Control-M.

4. **A job has been running for 4 hours longer than usual. How do you investigate?**
   Query `sysjobactivity` for the current step. Check `sys.dm_exec_requests` for the
   session's current query, wait type, and blocking info. Check `sys.dm_os_wait_stats`
   for systemic waits. Look at the output file for the running step.

5. **How do you manage Agent jobs across Dev/Test/Prod environments?**
   Script jobs using `sp_add_job` / `sp_add_jobstep` / `sp_add_schedule` stored in source
   control. Use SQLCMD variables for environment-specific values (server names, paths).
   Deploy scripts via CI/CD pipelines (Azure DevOps, Octopus Deploy).

---

## Quiz

**Q1: Each T-SQL job step runs in its own session. You declare `@BatchDate DATE` in step 1.
Can step 2 read it?**

<details>
<summary>Answer</summary>

No. Each step creates a separate database connection (session). Local variables, temp tables,
and session settings from step 1 are gone when step 2 begins. To share data between steps,
write to a permanent staging table or use Agent token macros.
</details>

**Q2: A job is scheduled at 2:00 AM on Sunday. It runs fine most weeks but skipped the
March 8 run. What happened?**

<details>
<summary>Answer</summary>

March 8 is the spring daylight saving transition (in most US time zones). At 2:00 AM, clocks
jump to 3:00 AM — 2:00 AM never occurs. The job had no valid firing time. To avoid this,
schedule jobs outside the 1:00-3:00 AM window, or use a time after 3:00 AM.
</details>

**Q3: You want step 3 of a job to run ONLY if step 2 fails (a cleanup step). How do you
configure this?**

<details>
<summary>Answer</summary>

Set step 2's `@on_success_action` to skip step 3 (either go to step 4, or quit with success).
Set step 2's `@on_fail_action = 4` (go to step) and `@on_fail_step_id = 3`. This way step 3
only executes when step 2 fails. Step 3's own on-success/on-fail actions determine what
happens next.
</details>

**Q4: What msdb table and column tells you whether a job's last run succeeded or failed?**

<details>
<summary>Answer</summary>

`msdb.dbo.sysjobhistory` — the `run_status` column. Values: 0 = Failed, 1 = Succeeded,
2 = Retry, 3 = Canceled, 4 = In Progress. Filter on `step_id = 0` to get the overall job
outcome rather than individual step outcomes.
</details>

**Q5: SQL Server Express does not include Agent. What alternative do you use?**

<details>
<summary>Answer</summary>

Use **Windows Task Scheduler** to call `sqlcmd` with a T-SQL script file:

```
sqlcmd -S localhost\SQLEXPRESS -d BNBuildersDB -i "C:\ETL\Scripts\nightly_load.sql" -o "C:\ETL\Logs\load.log"
```

Schedule this as a Windows Scheduled Task. You lose the multi-step flow control and msdb
history, but gain basic scheduling capability.
</details>
