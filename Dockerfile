# ------------------------------------------------------------------------------------
# Keycloak image built for postgresql support with theme handling customisation
# to always fallback to standard openremote theme.
# ------------------------------------------------------------------------------------
ARG VERSION=18.0.2
FROM quay.io/keycloak/keycloak:${VERSION} as builder
MAINTAINER support@openremote.io

# Add git commit label must be specified at build time using --build-arg GIT_COMMIT=dadadadadad
ARG GIT_COMMIT=unknown
LABEL git-commit=$GIT_COMMIT

# Configure build options
ENV KC_HEALTH_ENABLED=true
ENV KC_METRICS_ENABLED=true
ENV KC_FEATURES=token-exchange
ENV KC_DB=postgres
ENV KC_HTTP_RELATIVE_PATH=/auth

# Install openremote theme
ADD build/image/openremote-theme.jar /opt/keycloak/providers

# Install keycloak metrics provider
RUN curl -sL https://github.com/aerogear/keycloak-metrics-spi/releases/download/2.5.3/keycloak-metrics-spi-2.5.3.jar -o /opt/keycloak/providers/keycloak-metrics-spi-2.5.3.jar

# Build custom image and copy into this new image
RUN /opt/keycloak/bin/kc.sh build
FROM quay.io/keycloak/keycloak:${VERSION}
COPY --from=builder /opt/keycloak/ /opt/keycloak/

# Create standard deployment path and symlink themes (cannot --spi-theme-dir=/deployment/keycloak/themes)
USER 0
RUN rm -r /opt/keycloak/themes
RUN mkdir -p /deployment/keycloak/themes
RUN ln -s /deployment/keycloak/themes /opt/keycloak
USER 1000

WORKDIR /opt/keycloak

# Configure runtime options
ENV TZ=Europe/Amsterdam
ENV KC_DB_URL_HOST=postgresql
ENV KC_DB_URL_PORT=5432
ENV KC_DB_URL_DATABASE=openremote
ENV KC_DB_SCHEMA=public
ENV KC_DB_USERNAME=postgres
ENV KC_DB_PASSWORD=postgres
ENV KC_HOSTNAME=localhost
ENV KC_PROXY=edge
ENV KEYCLOAK_ADMIN=admin
ENV KEYCLOAK_ADMIN_PASSWORD=secret
ENV KC_LOG_LEVEL=info
ENV KEYCLOAK_DEFAULT_THEME=openremote
ENV KEYCLOAK_ACCOUNT_THEME=openremote
ENV KEYCLOAK_WELCOME_THEME=keycloak
ENV KEYCLOAK_START_COMMAND=start

HEALTHCHECK --interval=3s --timeout=3s --start-period=30s --retries=120 CMD curl --fail --silent http://localhost:8080/auth || exit 1

EXPOSE 8080

ENTRYPOINT /opt/keycloak/bin/kc.sh ${KEYCLOAK_START_COMMAND:-start} --spi-theme-default=${KEYCLOAK_DEFAULT_THEME:-openremote} --spi-theme-account-theme=${KEYCLOAK_ACCOUNT_THEME:-openremote} --spi-theme-welcome-theme=${KEYCLOAK_WELCOME_THEME:-keycloak} ${KEYCLOAK_START_OPTS:-}
