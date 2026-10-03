<!-- markdownlint-disable MD013 MD033 -->

# Package Visualizer

![issues](https://img.shields.io/github/issues/artiphishle/pkgviz?style=flat-square)
![PRs](https://img.shields.io/github/issues-pr/artiphishle/pkgviz?style=flat-square)

Tool to visualize packages and their dependencies between each other. This project is inspired by [socomo](https://github.com/gdela/socomo).

Good software architecture starts with matching functional requirements to code structure.
Visualizing and showing the dependencies of packages in your project is the first step to regain control of your project.

Supported and auto-selected parsers:

- C++
- Delphi
- Java
- Kotlin
- Python
- TypeScript

## Prerequisites

Make sure to have Bun and Node.js 24 or newer installed; check `package.json` for allowed versions.

## Project detection

Project inspection is provided by `@ankhorage/project-detector`, including nested source files,
package metadata, and polyglot evidence. Dependency/build directories and pkgviz's excluded
example/test directories are pruned. Incomplete inspections fail explicitly rather than selecting
a parser from partial results.

pkgviz owns parser selection: strongest language evidence first, then the number of evidence paths,
then the stable order TypeScript, Java, C++, Python, Delphi, Kotlin. All detected language candidates
remain available in audit metadata. This selects one parser; it does not parse every language in a
polyglot repository. Choose the relevant project directory when auditing separate applications.
JavaScript can be detected, but pkgviz does not currently provide a JavaScript parser.

Audit consumers: `meta.language.confidence` has been replaced by `score` (heuristic strength,
not a probability) and `candidates`. `language` and `indicators` remain available; indicators now
contain detector evidence paths. Parser-specific source-root resolution remains owned by pkgviz.

## Quickstart

Clone the repository and run in the root of `./pkgviz/`:

```bash
bun install

# DEV
bun dev

# PROD
bun run build
bun start

# Visit: localhost:3000
```

### Run Tests

```bash
# Run tests
bun run test

# Generate Coverage Report
bun test:cov:html
open ./test/coverage/index.html
```

<details>
  <summary>Audit Generation</summary>

The `bunx` script will create a `audit.json` in your project root:

```bash
# Run from the project root you want to analyze
bunx pkgviz
```

</details>

<details>
  <summary>Maven</summary>

The Maven adapter runs the same PKGViz audit/rule contract during `verify` and writes
`target/pkgviz-audit.json`.

For local development of the plugin itself:

```bash
mvn -B -f maven-plugin/pom.xml install
```

Then configure the plugin in the Maven project being audited:

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
    <packageSpec>pkgviz@YOUR_VERSION</packageSpec>
    <rules>
      <rule>cyclic-dependencies=block</rule>
    </rules>
    <failOnRuleViolation>true</failOnRuleViolation>
  </configuration>
</plugin>
```

Use `audit` instead of `block` to record cyclic dependencies without failing the build, or
`off` to disable that rule. Set `failOnRuleViolation=false` to keep blocking findings in the
audit while keeping the Maven build green.

See [maven-plugin/README.md](./maven-plugin/README.md) for the complete Maven configuration.

</details>


<details>
  <summary>Gradle</summary>

The Gradle adapter runs the same PKGViz audit/rule contract from `pkgvizAudit`, wires that task
into Gradle's `check` lifecycle, and writes `build/pkgviz-audit.json`.

```kotlin
plugins {
    id("io.github.artiphishle.pkgviz") version "YOUR_VERSION"
}

pkgviz {
    packageSpec.set("pkgviz@YOUR_VERSION")
    rules.set(listOf("cyclic-dependencies=block"))
    failOnRuleViolation.set(true)
}
```

The plugin is language-neutral at the build-tool boundary and supports both Java and Kotlin
projects through the same canonical PKGViz analyzers. Use `audit` instead of `block` to keep
cycle findings advisory, or `off` to disable the rule.

For local development of the adapter:

```bash
gradle -p gradle-plugin test
```

See [gradle-plugin/README.md](./gradle-plugin/README.md) for the complete configuration.

</details>

<details>
  <summary>GitHub Actions</summary>

PKGViz ships a reusable GitHub Actions workflow that always attempts to upload
`pkgviz-audit.json` as the `pkgviz-audit` artifact, including when a blocking rule fails.

```yaml
jobs:
  pkgviz-audit:
    uses: artiphishle/pkgviz/.github/workflows/pkgviz-audit.yml@vX.Y.Z
    with:
      pkgviz_version: X.Y.Z
      cyclic_dependencies: block
      fail_on_rule_violation: true
```

Pin both the workflow ref and `pkgviz_version` to a released version for reproducible CI.

Common policies:

```yaml
# Finding is written to the artifact and fails CI.
cyclic_dependencies: block
fail_on_rule_violation: true
```

```yaml
# Finding is written as advisory; CI stays green.
cyclic_dependencies: audit
fail_on_rule_violation: true
```

```yaml
# Rule stays blocking in the audit, but this CI run never fails only because of audit findings.
cyclic_dependencies: block
fail_on_rule_violation: false
```

```yaml
# Rule is disabled.
cyclic_dependencies: off
```

</details>

<details>
  <summary>Browser Visualization</summary>

To show the graph visualization in the browser:

```bash
# 1. Install dependencies
bun install

# 2. Create your .env file
cp .env.tpl .env

# 3. Supply the project path to analyze in the .env file

# 4. Run the app
bun dev
```

</details>

<details>
  <summary>Cycle highlights</summary>

Cycle highlighting is disabled by default. `NEXT_PUBLIC_SETTINGS_SHOW_CYCLES=true` enables all
detected cycles initially; an explicit per-cycle choice in localStorage takes precedence, including
an explicit disabled choice. Choices are scoped to `NEXT_PUBLIC_PROJECT_PATH` and survive tab changes
and reloads. This affects visualization only, not audit detection or blocking rules.

</details>

## Documentation

🔗 [artiphishle.github.io/pkgviz-docs](https://artiphishle.github.io/pkgviz-docs/)

### Extracted from this repository

Some reusable code of this repository has been extracted for flexible standalone usage:

- [akhorage/dependency-graph](https://github.com/ankhorage/dependency-graph)
- [akhorage/graph](https://github.com/ankhorage/dependency-graph)
- [akhorage/graph-cytoscape](https://github.com/ankhorage/dependency-graph)
- [ankhorage/project-detector](https://github.com/ankhorage/project-detector)

### Added to this repository

Some reusable standalone packages by `@artiphishle` have been introduced here:

- [ankhorage/devtools](https://github.com/ankhorage/devtools)
- [ankhorage/zora](https://github.com/ankhorage/zora)

## Contributing

The list of open source tools to visualize code structure is rather short. Structure101 is now part of Sonar. Don't let paid tools dominate software craft. Join us and contribute to open-source!
