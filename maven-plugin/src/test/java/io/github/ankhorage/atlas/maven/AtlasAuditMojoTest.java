package io.github.ankhorage.atlas.maven;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import org.apache.maven.plugin.MojoFailureException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class AtlasAuditMojoTest {
  @TempDir Path temporaryDirectory;

  @Test
  void cleanProjectPassesAndWritesAudit() throws Exception {
    final Path project = copyFixture("clean");
    final AtlasAuditMojo mojo = createMojo(project);

    assertDoesNotThrow(mojo::execute);

    final String audit = Files.readString(project.resolve("target/atlas-audit.json"));
    assertTrue(audit.contains("\"id\": \"cyclic-dependencies\""));
    assertTrue(audit.contains("\"status\": \"passed\""));
  }

  @Test
  void cyclicProjectFailsButRetainsAudit() throws Exception {
    final Path project = copyFixture("cyclic");
    final AtlasAuditMojo mojo = createMojo(project);

    assertThrows(MojoFailureException.class, mojo::execute);

    final Path artifact = project.resolve("target/atlas-audit.json");
    assertTrue(Files.isRegularFile(artifact));
    final String audit = Files.readString(artifact);
    assertTrue(audit.contains("\"mode\": \"block\""));
    assertTrue(audit.contains("\"status\": \"failed\""));
    assertTrue(audit.contains("\"policy\": \"blocking\""));
  }

  @Test
  void auditOnlyRuleKeepsCyclicBuildGreen() throws Exception {
    final Path project = copyFixture("cyclic");
    final AtlasAuditMojo mojo = createMojo(project);
    mojo.rules = List.of("cyclic-dependencies=audit");

    assertDoesNotThrow(mojo::execute);

    final String audit = Files.readString(project.resolve("target/atlas-audit.json"));
    assertTrue(audit.contains("\"mode\": \"audit\""));
    assertTrue(audit.contains("\"status\": \"failed\""));
    assertTrue(audit.contains("\"policy\": \"advisory\""));
  }

  @Test
  void globalNoFailKeepsBlockingFindingButKeepsBuildGreen() throws Exception {
    final Path project = copyFixture("cyclic");
    final AtlasAuditMojo mojo = createMojo(project);
    mojo.failOnRuleViolation = false;

    assertDoesNotThrow(mojo::execute);

    final String audit = Files.readString(project.resolve("target/atlas-audit.json"));
    assertTrue(audit.contains("\"failOnRuleViolation\": false"));
    assertTrue(audit.contains("\"mode\": \"block\""));
    assertTrue(audit.contains("\"policy\": \"blocking\""));
    assertTrue(audit.contains("\"status\": \"failed\""));
  }

  @Test
  void disabledRuleIsAbsentFromRuleResults() throws Exception {
    final Path project = copyFixture("cyclic");
    final AtlasAuditMojo mojo = createMojo(project);
    mojo.rules = List.of("cyclic-dependencies=off");

    assertDoesNotThrow(mojo::execute);

    final String audit = Files.readString(project.resolve("target/atlas-audit.json"));
    assertTrue(audit.contains("\"mode\": \"off\""));
    assertTrue(audit.contains("\"cyclicPackages\""));
    assertEquals(1, countOccurrences(audit, "\"id\": \"cyclic-dependencies\""));
  }

  private static int countOccurrences(String value, String needle) {
    int count = 0;
    int offset = 0;
    while ((offset = value.indexOf(needle, offset)) >= 0) {
      count++;
      offset += needle.length();
    }
    return count;
  }

  private AtlasAuditMojo createMojo(Path project) {
    final Path repoRoot = Path.of(System.getProperty("atlas.repoRoot")).toAbsolutePath().normalize();
    final AtlasAuditMojo mojo = new AtlasAuditMojo();
    mojo.projectDirectory = project.toFile();
    mojo.outputFile = project.resolve("target/atlas-audit.json").toFile();
    mojo.executable = "bun";
    mojo.cliPath = repoRoot.resolve("bin/atlas.ts").toFile();
    mojo.packageSpec = "@ankhorage/atlas";
    mojo.rules = List.of();
    mojo.failOnRuleViolation = true;
    return mojo;
  }

  private Path copyFixture(String name) throws IOException {
    final Path repoRoot = Path.of(System.getProperty("atlas.repoRoot")).toAbsolutePath().normalize();
    final Path source =
        repoRoot.resolve("maven-plugin/src/test/resources/fixtures").resolve(name);
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
