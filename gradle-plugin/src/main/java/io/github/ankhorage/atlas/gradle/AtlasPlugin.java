package io.github.ankhorage.atlas.gradle;

import java.util.List;
import org.gradle.api.Plugin;
import org.gradle.api.Project;
import org.gradle.api.tasks.TaskProvider;

/**
 * Registers Atlas as a Gradle verification adapter backed by the canonical Atlas CLI.
 */
public final class AtlasPlugin implements Plugin<Project> {
  @Override
  public void apply(Project project) {
    project.getPluginManager().apply("base");

    final AtlasExtension extension =
        project.getExtensions().create("atlas", AtlasExtension.class);
    extension.getExecutable().convention("npx");
    extension.getPackageSpec().convention("@ankhorage/atlas");
    extension.getOutputFile().convention(project.getLayout().getBuildDirectory().file("atlas-audit.json"));
    extension.getRules().convention(List.of());
    extension.getFailOnRuleViolation().convention(true);
    extension.getSkip().convention(false);

    final TaskProvider<AtlasAuditTask> auditTask =
        project
            .getTasks()
            .register(
                "atlasAudit",
                AtlasAuditTask.class,
                task -> {
                  task.setGroup("verification");
                  task.setDescription("Runs the canonical Atlas audit and configured rules.");
                  task.getExecutable().convention(extension.getExecutable());
                  task.getPackageSpec().convention(extension.getPackageSpec());
                  task.getCliPath().convention(extension.getCliPath());
                  task.getOutputFile().convention(extension.getOutputFile());
                  task.getRules().convention(extension.getRules());
                  task.getFailOnRuleViolation().convention(extension.getFailOnRuleViolation());
                  task.getSkip().convention(extension.getSkip());
                });

    project.getTasks().named("check").configure(task -> task.dependsOn(auditTask));
  }
}
