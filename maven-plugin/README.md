# PKGViz Maven Plugin

Thin Maven adapter for the shared PKGViz audit and rule engine.

The plugin does not implement dependency analysis or audit rules in Java. It invokes the published
PKGViz CLI and maps the shared exit contract into Maven build semantics.

## Rule policy

Each rule has one mode:

- `off`: rule disabled; no rule result is emitted
- `audit`: finding is written to the audit as advisory and never fails CI
- `block`: finding is blocking and fails CI by default

The default is:

```text
cyclic-dependencies=block
failOnRuleViolation=true
```

To collect the audit but never fail the build because of rule findings, keep the rule policy and
disable execution enforcement:

```xml
<configuration>
  <failOnRuleViolation>false</failOnRuleViolation>
</configuration>
```

The audit still records `cyclic-dependencies` as a failed blocking rule, but Maven stays green.

To make only cyclic dependencies audit-only:

```xml
<configuration>
  <rules>
    <rule>cyclic-dependencies=audit</rule>
  </rules>
</configuration>
```

To disable the rule completely:

```xml
<configuration>
  <rules>
    <rule>cyclic-dependencies=off</rule>
  </rules>
</configuration>
```

Future rules use the same repeated `<rule>id=mode</rule>` contract, so Maven does not need
rule-specific Java code.

## Goal

`pkgviz:audit` runs during `verify` by default.

- exit code `0`: execution succeeded
- exit code `2`: a blocking audit rule failed and enforcement is enabled
- other non-zero exit codes: audit execution/configuration failure
- the audit is written to `target/pkgviz-audit.json` before a rule failure is raised

## Configuration

By default the plugin runs:

```text
npx --yes pkgviz --out target/pkgviz-audit.json
```

For reproducible CI, pin `pkgviz.packageSpec` to the PKGViz release your pipeline expects.

```xml
<plugin>
  <groupId>io.github.artiphishle</groupId>
  <artifactId>pkgviz-maven-plugin</artifactId>
  <version>0.1.0-SNAPSHOT</version>
  <executions>
    <execution>
      <goals>
        <goal>audit</goal>
      </goals>
    </execution>
  </executions>
  <configuration>
    <packageSpec>@ankhorage/pkgviz@YOUR_VERSION</packageSpec>
    <rules>
      <rule>cyclic-dependencies=block</rule>
    </rules>
    <failOnRuleViolation>true</failOnRuleViolation>
  </configuration>
</plugin>
```

`pkgviz.executable`, `pkgviz.packageSpec`, `pkgviz.output`, `pkgviz.cli`,
`pkgviz.rules`, `pkgviz.failOnRuleViolation`, and `pkgviz.skip` are configurable Maven
properties. `pkgviz.skip=true` skips analysis entirely and therefore produces no audit artifact.
