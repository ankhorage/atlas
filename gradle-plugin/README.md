# Atlas Gradle Plugin

Thin Gradle adapter for the shared Atlas audit and rule engine.

The plugin does not implement dependency analysis or audit rules in Java. It invokes the published
Atlas CLI and maps the shared exit contract into Gradle build semantics. It is language-neutral at
the adapter layer and supports Java and Kotlin projects through the canonical Atlas analyzers.

## Tasks

- `atlasAudit`: runs the canonical Atlas audit
- `check`: depends on `atlasAudit`

The default audit output is `build/atlas-audit.json`.

## Rule policy

Each rule uses the canonical Atlas mode:

- `off`: rule disabled
- `audit`: finding is advisory and does not fail the build
- `block`: finding is blocking and fails the build when enforcement is enabled

Atlas itself defaults `cyclic-dependencies` to `block`.

## Configuration

Once published through a Gradle plugin repository, consumers can apply:

```kotlin
plugins {
    id("io.github.ankhorage.atlas") version "YOUR_VERSION"
}

atlas {
    packageSpec.set("@ankhorage/atlas@YOUR_VERSION")
    rules.set(listOf("cyclic-dependencies=block"))
    failOnRuleViolation.set(true)
}
```

Groovy DSL:

```groovy
plugins {
    id 'io.github.ankhorage.atlas' version 'YOUR_VERSION'
}

atlas {
    packageSpec = '@ankhorage/atlas@YOUR_VERSION'
    rules = ['cyclic-dependencies=block']
    failOnRuleViolation = true
}
```

For repository or consumer proof tests, `cliPath` can point at a local Atlas CLI and
`executable` can be set to `bun`.

The adapter preserves the Atlas process contract:

- exit code `0`: audit succeeded
- exit code `2`: a blocking rule failed and the audit artifact must still exist
- any other non-zero exit code: execution or configuration failure
