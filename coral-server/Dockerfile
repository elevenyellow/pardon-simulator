FROM gradle:8.14.2-jdk21-alpine AS build
COPY --chown=gradle:gradle coral-server /home/gradle/src
WORKDIR /home/gradle/src

RUN jlink \
    --verbose \
    --add-modules java.base,jdk.unsupported,java.desktop,java.instrument,java.logging,java.management,java.sql,java.xml,java.naming,jdk.crypto.ec \
    --compress 2 --strip-debug --no-header-files --no-man-pages \
    --output /opt/minimal-java

RUN gradle build --no-daemon -x test

FROM alpine:3

RUN apk add --no-cache ca-certificates curl

ENV JAVA_HOME=/opt/minimal-java
ENV PATH="$JAVA_HOME/bin:$PATH"

ENV CONFIG_PATH="/config"

RUN mkdir /app
# Copy the custom minimal JRE from the builder stage
COPY --from=build "$JAVA_HOME" "$JAVA_HOME"
COPY --from=build /home/gradle/src/build/libs/ /app/
# Determine the built coral-server JAR (excluding -plain) and create a stable symlink
RUN ln -s "$(ls -1 /app/coral-server-*.jar | grep -v '\-plain\.jar' | head -n 1)" /app/coral-server.jar

# Copy agent coral-agent.toml files from host context
RUN mkdir -p /app/agents/trump-donald /app/agents/trump-melania /app/agents/trump-eric /app/agents/trump-donjr /app/agents/trump-barron /app/agents/sbf /app/agents/cz
COPY agents/trump-donald/coral-agent.toml /app/agents/trump-donald/coral-agent.toml
COPY agents/trump-melania/coral-agent.toml /app/agents/trump-melania/coral-agent.toml
COPY agents/trump-eric/coral-agent.toml /app/agents/trump-eric/coral-agent.toml
COPY agents/trump-donjr/coral-agent.toml /app/agents/trump-donjr/coral-agent.toml
COPY agents/trump-barron/coral-agent.toml /app/agents/trump-barron/coral-agent.toml
COPY agents/sbf/coral-agent.toml /app/agents/sbf/coral-agent.toml
COPY agents/cz/coral-agent.toml /app/agents/cz/coral-agent.toml

# Create registry.toml with agent paths
RUN printf '# Pardon Simulator Agent Registry\n\
[[local-agent]]\n\
path = "/app/agents/trump-donald"\n\
\n\
[[local-agent]]\n\
path = "/app/agents/trump-melania"\n\
\n\
[[local-agent]]\n\
path = "/app/agents/trump-eric"\n\
\n\
[[local-agent]]\n\
path = "/app/agents/trump-donjr"\n\
\n\
[[local-agent]]\n\
path = "/app/agents/trump-barron"\n\
\n\
[[local-agent]]\n\
path = "/app/agents/sbf"\n\
\n\
[[local-agent]]\n\
path = "/app/agents/cz"\n' > /app/registry.toml

ENV REGISTRY_FILE_PATH=/app/registry.toml

ENTRYPOINT ["java","-jar", "/app/coral-server.jar"]