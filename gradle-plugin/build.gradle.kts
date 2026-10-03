plugins {
    `java-gradle-plugin`
}

group = "io.github.artiphishle"
version = "0.1.0-SNAPSHOT"

repositories {
    mavenCentral()
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

gradlePlugin {
    plugins {
        create("pkgviz") {
            id = "io.github.artiphishle.pkgviz"
            implementationClass = "io.github.artiphishle.pkgviz.gradle.PkgvizPlugin"
            displayName = "PKGViz Gradle Plugin"
            description = "Thin Gradle adapter for the shared PKGViz audit and rule contract."
        }
    }
}

dependencies {
    testImplementation(platform("org.junit:junit-bom:5.13.4"))
    testImplementation("org.junit.jupiter:junit-jupiter")
}

tasks.test {
    useJUnitPlatform()
    systemProperty("pkgviz.repoRoot", rootProject.projectDir.parentFile.absolutePath)
    testLogging {
        events("failed")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
        showStandardStreams = true
    }
}
