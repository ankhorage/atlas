plugins {
    `java-gradle-plugin`
}

group = "io.github.ankhorage"
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
        create("atlas") {
            id = "io.github.ankhorage.atlas"
            implementationClass = "io.github.ankhorage.atlas.gradle.AtlasPlugin"
            displayName = "Atlas Gradle Plugin"
            description = "Thin Gradle adapter for the shared Atlas audit and rule contract."
        }
    }
}

dependencies {
    testImplementation(platform("org.junit:junit-bom:5.13.4"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.test {
    useJUnitPlatform()
    systemProperty("atlas.repoRoot", rootProject.projectDir.parentFile.absolutePath)
    testLogging {
        events("failed")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
        showStandardStreams = true
    }
}
