package io.github.ankhorage.atlas.gradle;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.gradle.api.DefaultTask;
import org.gradle.api.GradleException;
import org.gradle.api.file.RegularFileProperty;
import org.gradle.api.provider.ListProperty;
import org.gradle.api.provider.Property;
import org.gradle.api.tasks.Input;
import org.gradle.api.tasks.InputFile;
import org.gradle.api.tasks.Optional;
import org.gradle.api.tasks.OutputFile;
import org.gradle.api.tasks.PathSensitive;
import org.gradle.api.tasks.PathSensitivity;
import org.gradle.api.tasks.TaskAction;
import org.gradle.work.DisableCachingByDefault;

/**
 * Runs the shared Atlas audit contract from a Gradle build.
 */
@DisableCachingByDefault(because = "Atlas analyzes the live project tree through an external CLI process.")
public abstract class AtlasAuditTask extends DefaultTask {
  private static final int RULE_FAILURE_EXIT_CODE = 2;

  @Input
  public abstract Property<String> getExecutable();

  @Input
  public abstract Property<String> getPackageSpec();

  @Optional
  @InputFile
  @PathSensitive(PathSensitivity.ABSOLUTE)
  public abstract RegularFileProperty getCliPath();

  @OutputFile
  public abstract RegularFileProperty getOutputFile();

  @Input
  public abstract ListProperty<String> getRules();

  @Input
  public abstract Property<Boolean> getFailOnRuleViolation();

  @Input
  public abstract Property<Boolean> getSkip();

  @TaskAction
  public void audit() {
    if (getSkip().get()) {
      getLogger().lifecycle("Atlas audit skipped.");
      return;
    }

    final Path projectRoot = getProject().getProjectDir().toPath().toAbsolutePath().normalize();
    final Path artifactPath = getOutputFile().get().getAsFile().toPath().toAbsolutePath().normalize();
    if (!artifactPath.startsWith(projectRoot)) {
      throw new GradleException("Atlas audit output must stay inside the Gradle project.");
    }

    final Path parent = artifactPath.getParent();
    try {
      if (parent != null) Files.createDirectories(parent);
    } catch (IOException error) {
      throw new GradleException("Failed to prepare Atlas audit output directory.", error);
    }

    final List<String> command = createCommand(projectRoot, artifactPath);
    getLogger().lifecycle("Running Atlas audit.");

    final int exitCode;
    try {
      final Process process =
          new ProcessBuilder(command).directory(projectRoot.toFile()).inheritIO().start();
      exitCode = process.waitFor();
    } catch (IOException error) {
      throw new GradleException("Failed to start the Atlas audit process.", error);
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      throw new GradleException("Atlas audit process was interrupted.", error);
    }

    final boolean artifactExists = Files.isRegularFile(artifactPath);
    if (exitCode == RULE_FAILURE_EXIT_CODE) {
      if (!artifactExists) {
        throw new GradleException(
            "Atlas reported a rule failure without producing the audit artifact.");
      }
      throw new GradleException("Atlas audit rules failed. Audit: " + artifactPath);
    }

    if (exitCode != 0) {
      throw new GradleException("Atlas audit execution failed with exit code " + exitCode + ".");
    }
    if (!artifactExists) {
      throw new GradleException("Atlas audit completed without producing " + artifactPath + ".");
    }

    getLogger().lifecycle("Atlas audit: " + artifactPath);
  }

  private List<String> createCommand(Path projectRoot, Path artifactPath) {
    final String executable = getExecutable().get();
    if (executable.isBlank()) {
      throw new GradleException("atlas.executable must not be empty.");
    }

    final List<String> command = new ArrayList<>();
    command.add(resolveExecutable(executable));

    if (getCliPath().isPresent()) {
      command.add(getCliPath().get().getAsFile().toPath().toAbsolutePath().normalize().toString());
    } else {
      final String packageSpec = getPackageSpec().get();
      if (packageSpec.isBlank()) {
        throw new GradleException("atlas.packageSpec must not be empty.");
      }
      command.add("--yes");
      command.add(packageSpec);
    }

    command.add("--out");
    command.add(
        projectRoot.relativize(artifactPath).toString().replace(File.separatorChar, '/'));

    for (String rule : getRules().get()) {
      if (rule == null || rule.isBlank()) {
        throw new GradleException("atlas.rules must not contain empty values.");
      }
      command.add("--rule");
      command.add(rule);
    }

    if (!getFailOnRuleViolation().get()) {
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
