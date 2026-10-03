package io.github.ankhorage.atlas.maven;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.apache.maven.plugin.AbstractMojo;
import org.apache.maven.plugin.MojoExecutionException;
import org.apache.maven.plugin.MojoFailureException;
import org.apache.maven.plugins.annotations.LifecyclePhase;
import org.apache.maven.plugins.annotations.Mojo;
import org.apache.maven.plugins.annotations.Parameter;

/**
 * Runs the shared Atlas audit contract during a Maven build.
 */
@Mojo(name = "audit", defaultPhase = LifecyclePhase.VERIFY, threadSafe = true)
public final class AtlasAuditMojo extends AbstractMojo {
  private static final int RULE_FAILURE_EXIT_CODE = 2;

  @Parameter(defaultValue = "${project.basedir}", readonly = true, required = true)
  File projectDirectory;

  @Parameter(
      defaultValue = "${project.build.directory}/atlas-audit.json",
      property = "atlas.output",
      required = true)
  File outputFile;

  @Parameter(defaultValue = "npx", property = "atlas.executable", required = true)
  String executable;

  @Parameter(defaultValue = "@ankhorage/atlas", property = "atlas.packageSpec", required = true)
  String packageSpec;

  @Parameter(property = "atlas.cli")
  File cliPath;

  @Parameter(property = "atlas.rules")
  List<String> rules = List.of();

  @Parameter(defaultValue = "true", property = "atlas.failOnRuleViolation")
  boolean failOnRuleViolation = true;

  @Parameter(defaultValue = "false", property = "atlas.skip")
  boolean skip;

  @Override
  public void execute() throws MojoExecutionException, MojoFailureException {
    if (skip) {
      getLog().info("Atlas audit skipped.");
      return;
    }

    final Path projectRoot = projectDirectory.toPath().toAbsolutePath().normalize();
    final Path artifactPath = outputFile.toPath().toAbsolutePath().normalize();
    if (!artifactPath.startsWith(projectRoot)) {
      throw new MojoExecutionException("Atlas audit output must stay inside the Maven project.");
    }

    final Path parent = artifactPath.getParent();
    try {
      if (parent != null) Files.createDirectories(parent);
    } catch (IOException error) {
      throw new MojoExecutionException("Failed to prepare Atlas audit output directory.", error);
    }

    final List<String> command = createCommand(projectRoot, artifactPath);
    getLog().info("Running Atlas audit.");

    final int exitCode;
    try {
      final Process process =
          new ProcessBuilder(command).directory(projectRoot.toFile()).inheritIO().start();
      exitCode = process.waitFor();
    } catch (IOException error) {
      throw new MojoExecutionException("Failed to start the Atlas audit process.", error);
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      throw new MojoExecutionException("Atlas audit process was interrupted.", error);
    }

    final boolean artifactExists = Files.isRegularFile(artifactPath);
    if (exitCode == RULE_FAILURE_EXIT_CODE) {
      if (!artifactExists) {
        throw new MojoExecutionException(
            "Atlas reported a rule failure without producing the audit artifact.");
      }
      throw new MojoFailureException("Atlas audit rules failed. Audit: " + artifactPath);
    }

    if (exitCode != 0) {
      throw new MojoExecutionException("Atlas audit execution failed with exit code " + exitCode + ".");
    }
    if (!artifactExists) {
      throw new MojoExecutionException("Atlas audit completed without producing " + artifactPath + ".");
    }

    getLog().info("Atlas audit: " + artifactPath);
  }

  private List<String> createCommand(Path projectRoot, Path artifactPath)
      throws MojoExecutionException {
    if (executable == null || executable.isBlank()) {
      throw new MojoExecutionException("atlas.executable must not be empty.");
    }

    final List<String> command = new ArrayList<>();
    command.add(resolveExecutable(executable));

    if (cliPath != null) {
      command.add(cliPath.toPath().toAbsolutePath().normalize().toString());
    } else {
      if (packageSpec == null || packageSpec.isBlank()) {
        throw new MojoExecutionException("atlas.packageSpec must not be empty.");
      }
      command.add("--yes");
      command.add(packageSpec);
    }

    command.add("--out");
    command.add(projectRoot.relativize(artifactPath).toString().replace(File.separatorChar, '/'));

    if (rules != null) {
      for (String rule : rules) {
        if (rule == null || rule.isBlank()) {
          throw new MojoExecutionException("atlas.rules must not contain empty values.");
        }
        command.add("--rule");
        command.add(rule);
      }
    }
    if (!failOnRuleViolation) {
      command.add("--no-fail-on-rule-violation");
    }

    return command;
  }

  private static String resolveExecutable(String configuredExecutable) {
    final boolean windows =
        System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
    if (windows && configuredExecutable.equals("npx")) return "npx.cmd";
    return configuredExecutable;
  }
}
