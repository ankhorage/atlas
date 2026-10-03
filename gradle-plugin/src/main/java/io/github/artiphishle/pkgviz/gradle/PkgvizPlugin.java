package io.github.artiphishle.pkgviz.gradle;

import java.util.List;
import org.gradle.api.Plugin;
import org.gradle.api.Project;
import org.gradle.api.tasks.TaskProvider;

/**
 * Registers PKGViz as a Gradle verification adapter backed by the canonical PKGViz CLI.
 */
public final class PkgvizPlugin implements Plugin<Project> {
  @Override
  public void apply(Project project) {
    project.getPluginManager().apply("base");

    final PkgvizExtension extension =
        project.getExtensions().create("pkgviz", PkgvizExtension.class);
    extension.getExecutable().convention("npx");
    extension.getPackageSpec().convention("@ankhorage/pkgviz");
    extension.getOutputFile().convention(project.getLayout().getBuildDirectory().file("pkgviz-audit.json"));
    extension.getRules().convention(List.of());
    extension.getFailOnRuleViolation().convention(true);
    extension.getSkip().convention(false);

    final TaskProvider<PkgvizAuditTask> auditTask =
        project
            .getTasks()
            .register(
                "pkgvizAudit",
                PkgvizAuditTask.class,
                task -> {
                  task.setGroup("verification");
                  task.setDescription("Runs the canonical PKGViz audit and configured rules.");
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
