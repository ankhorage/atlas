package io.github.artiphishle.pkgviz.maven;

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
 * Runs the shared PKGViz audit contract during a Maven build.
 */
@Mojo(name = "audit", defaultPhase = LifecyclePhase.VERIFY, threadSafe = true)
public final class PkgvizAuditMojo extends AbstractMojo {
  private static final int RULE_FAILURE_EXIT_CODE = 2;

  @Parameter(defaultValue = "${project.basedir}", readonly = true, required = true)
  File projectDirectory;

  @Parameter(
      defaultValue = "${project.build.directory}/pkgviz-audit.json",
      property = "pkgviz.output",
      required = true)
  File outputFile;

  @Parameter(defaultValue = "npx", property = "pkgviz.executable", required = true)
  String executable;

  @Parameter(defaultValue = "@ankhorage/pkgviz", property = "pkgviz.packageSpec", required = true)
  String packageSpec;

  @Parameter(property = "pkgviz.cli")
  File cliPath;

  @Parameter(property = "pkgviz.rules")
  List<String> rules = List.of();

  @Parameter(defaultValue = "true", property = "pkgviz.failOnRuleViolation")
  boolean failOnRuleViolation = true;

  @Parameter(defaultValue = "false", property = "pkgviz.skip")
  boolean skip;

  @Override
  public void execute() throws MojoExecutionException, MojoFailureException {
    if (skip) {
      getLog().info("PKGViz audit skipped.");
      return;
    }

    final Path projectRoot = projectDirectory.toPath().toAbsolutePath().normalize();
    final Path artifactPath = outputFile.toPath().toAbsolutePath().normalize();
    if (!artifactPath.startsWith(projectRoot)) {
      throw new MojoExecutionException("PKGViz audit output must stay inside the Maven project.");
    }

    final Path parent = artifactPath.getParent();
    try {
      if (parent != null) Files.createDirectories(parent);
    } catch (IOException error) {
      throw new MojoExecutionException("Failed to prepare PKGViz audit output directory.", error);
    }

    final List<String> command = createCommand(projectRoot, artifactPath);
    getLog().info("Running PKGViz audit.");

    final int exitCode;
    try {
      final Process process =
          new ProcessBuilder(command).directory(projectRoot.toFile()).inheritIO().start();
      exitCode = process.waitFor();
    } catch (IOException error) {
      throw new MojoExecutionException("Failed to start the PKGViz audit process.", error);
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      throw new MojoExecutionException("PKGViz audit process was interrupted.", error);
    }

    final boolean artifactExists = Files.isRegularFile(artifactPath);
    if (exitCode == RULE_FAILURE_EXIT_CODE) {
      if (!artifactExists) {
        throw new MojoExecutionException(
            "PKGViz reported a rule failure without producing the audit artifact.");
      }
      throw new MojoFailureException("PKGViz audit rules failed. Audit: " + artifactPath);
    }

    if (exitCode != 0) {
      throw new MojoExecutionException("PKGViz audit execution failed with exit code " + exitCode + ".");
    }
    if (!artifactExists) {
      throw new MojoExecutionException("PKGViz audit completed without producing " + artifactPath + ".");
    }

    getLog().info("PKGViz audit: " + artifactPath);
  }

  private List<String> createCommand(Path projectRoot, Path artifactPath)
      throws MojoExecutionException {
    if (executable == null || executable.isBlank()) {
      throw new MojoExecutionException("pkgviz.executable must not be empty.");
    }

    final List<String> command = new ArrayList<>();
    command.add(resolveExecutable(executable));

    if (cliPath != null) {
      command.add(cliPath.toPath().toAbsolutePath().normalize().toString());
    } else {
      if (packageSpec == null || packageSpec.isBlank()) {
        throw new MojoExecutionException("pkgviz.packageSpec must not be empty.");
      }
      command.add("--yes");
      command.add(packageSpec);
    }

    command.add("--out");
    command.add(projectRoot.relativize(artifactPath).toString().replace(File.separatorChar, '/'));

    if (rules != null) {
      for (String rule : rules) {
        if (rule == null || rule.isBlank()) {
          throw new MojoExecutionException("pkgviz.rules must not contain empty values.");
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
