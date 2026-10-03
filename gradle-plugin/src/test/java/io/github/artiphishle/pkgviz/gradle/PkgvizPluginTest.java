package io.github.artiphishle.pkgviz.gradle;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import org.gradle.testkit.runner.BuildResult;
import org.gradle.testkit.runner.GradleRunner;
import org.gradle.testkit.runner.TaskOutcome;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class PkgvizPluginTest {
  @TempDir Path temporaryDirectory;

  @Test
  void checkRunsPkgvizAuditForCleanJavaProject() throws Exception {
    final Path project = copyFixture("java-clean");
    writeGroovyBuild(project, "cyclic-dependencies=block", true);

    final BuildResult result = runner(project, "check").build();

    assertEquals(TaskOutcome.SUCCESS, result.task(":pkgvizAudit").getOutcome());
    final String audit = Files.readString(project.resolve("build/pkgviz-audit.json"));
    assertTrue(audit.contains("\"id\": \"cyclic-dependencies\""));
    assertTrue(audit.contains("\"status\": \"passed\""));
  }

  @Test
  void blockingCycleFailsButRetainsAudit() throws Exception {
    final Path project = copyFixture("java-cyclic");
    writeGroovyBuild(project, "cyclic-dependencies=block", true);

    final BuildResult result = runner(project, "pkgvizAudit").buildAndFail();

    assertTrue(result.getOutput().contains("PKGViz audit rules failed"));
    final Path artifact = project.resolve("build/pkgviz-audit.json");
    assertTrue(Files.isRegularFile(artifact));
    final String audit = Files.readString(artifact);
    assertTrue(audit.contains("\"mode\": \"block\""));
    assertTrue(audit.contains("\"status\": \"failed\""));
    assertTrue(audit.contains("\"policy\": \"blocking\""));
  }

  @Test
  void auditOnlyCycleKeepsBuildGreen() throws Exception {
    final Path project = copyFixture("java-cyclic");
    writeGroovyBuild(project, "cyclic-dependencies=audit", true);

    final BuildResult result = runner(project, "pkgvizAudit").build();

    assertEquals(TaskOutcome.SUCCESS, result.task(":pkgvizAudit").getOutcome());
    final String audit = Files.readString(project.resolve("build/pkgviz-audit.json"));
    assertTrue(audit.contains("\"mode\": \"audit\""));
    assertTrue(audit.contains("\"status\": \"failed\""));
    assertTrue(audit.contains("\"policy\": \"advisory\""));
  }

  @Test
  void disabledCycleRuleKeepsBuildGreen() throws Exception {
    final Path project = copyFixture("java-cyclic");
    writeGroovyBuild(project, "cyclic-dependencies=off", true);

    final BuildResult result = runner(project, "pkgvizAudit").build();

    assertEquals(TaskOutcome.SUCCESS, result.task(":pkgvizAudit").getOutcome());
    final String audit = Files.readString(project.resolve("build/pkgviz-audit.json"));
    assertTrue(audit.contains("\"mode\": \"off\""));
  }

  @Test
  void kotlinGradleProjectUsesTheSameAdapter() throws Exception {
    final Path project = copyFixture("kotlin-clean");
    writeKotlinBuild(project);

    final BuildResult result = runner(project, "pkgvizAudit").build();

    assertEquals(TaskOutcome.SUCCESS, result.task(":pkgvizAudit").getOutcome());
    final String audit = Files.readString(project.resolve("build/pkgviz-audit.json"));
    assertTrue(audit.contains("\"language\": \"kotlin\""));
    assertTrue(audit.contains("\"status\": \"passed\""));
  }

  private GradleRunner runner(Path project, String task) {
    return GradleRunner.create()
        .withProjectDir(project.toFile())
        .withArguments(task, "--stacktrace")
        .withPluginClasspath();
  }

  private void writeGroovyBuild(Path project, String rule, boolean failOnRuleViolation)
      throws IOException {
    final String cliPath = escapedCliPath();
    Files.writeString(
        project.resolve("build.gradle"),
        """
        plugins {
            id 'java'
            id 'io.github.artiphishle.pkgviz'
        }

        pkgviz {
            executable.set('bun')
            cliPath.set(file('%s'))
            rules.set(['%s'])
            failOnRuleViolation.set(%s)
        }
        """
            .formatted(cliPath, rule, failOnRuleViolation));
    Files.writeString(project.resolve("settings.gradle"), "rootProject.name = 'fixture'\n");
  }

  private void writeKotlinBuild(Path project) throws IOException {
    final String cliPath = escapedCliPath();
    Files.writeString(
        project.resolve("build.gradle.kts"),
        """
        plugins {
            id("io.github.artiphishle.pkgviz")
        }

        pkgviz {
            executable.set("bun")
            cliPath.set(file("%s"))
            rules.set(listOf("cyclic-dependencies=block"))
            failOnRuleViolation.set(true)
        }
        """
            .formatted(cliPath));
    Files.writeString(project.resolve("settings.gradle.kts"), "rootProject.name = \"fixture\"\n");
  }

  private String escapedCliPath() {
    final Path repoRoot = Path.of(System.getProperty("pkgviz.repoRoot")).toAbsolutePath().normalize();
    return repoRoot.resolve("bin/pkgviz.ts").toString().replace("\\", "\\\\");
  }

  private Path copyFixture(String name) throws IOException, URISyntaxException {
    final Path source =
        Path.of(PkgvizPluginTest.class.getResource("/fixtures/" + name).toURI()).toAbsolutePath();
    final Path destination = temporaryDirectory.resolve(name);

    try (var files = Files.walk(source)) {
      for (Path path : files.toList()) {
        final Path relative = source.relativize(path);
        final Path target = destination.resolve(relative);
        if (Files.isDirectory(path)) {
          Files.createDirectories(target);
        } else {
          Files.createDirectories(target.getParent());
          Files.copy(path, target, StandardCopyOption.REPLACE_EXISTING);
        }
      }
    }
    return destination;
  }
}
