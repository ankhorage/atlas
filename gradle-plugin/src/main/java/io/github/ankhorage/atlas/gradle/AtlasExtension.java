package io.github.ankhorage.atlas.gradle;

import org.gradle.api.file.RegularFileProperty;
import org.gradle.api.provider.ListProperty;
import org.gradle.api.provider.Property;

/**
 * Configures the Atlas audit task without duplicating analysis or rule logic in Gradle.
 */
public abstract class AtlasExtension {
  public abstract Property<String> getExecutable();

  public abstract Property<String> getPackageSpec();

  public abstract RegularFileProperty getCliPath();

  public abstract RegularFileProperty getOutputFile();

  public abstract ListProperty<String> getRules();

  public abstract Property<Boolean> getFailOnRuleViolation();

  public abstract Property<Boolean> getSkip();
}
