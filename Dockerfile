# ------------------------------------------------------------------------------------
# Keycloak image built for postgresql support with theme handling customisation
# to always fallback to standard openremote theme.
# ------------------------------------------------------------------------------------
ARG VERSION=26.7.3

ARG KC_HEALTH_ENABLED=true
ARG KC_METRICS_ENABLED=true
ARG KC_DB=postgres
ARG KC_HTTP_RELATIVE_PATH=/auth

FROM registry.access.redhat.com/ubi9 AS ubi-micro-build
LABEL maintainer="support@openremote.io"

RUN mkdir -p /mnt/rootfs && \
    dnf install --installroot /mnt/rootfs curl  --releasever 9 --setopt install_weak_deps=false --nodocs -y && \
    dnf --installroot /mnt/rootfs clean all && \
    rpm --root /mnt/rootfs -e --nodeps setup

FROM keycloak/keycloak:${VERSION} AS builder

# Add git commit label must be specified at build time using --build-arg GIT_COMMIT=dadadadadad
ARG GIT_COMMIT=unknown
LABEL git-commit=$GIT_COMMIT

# Configure build options
ARG KC_HEALTH_ENABLED
ARG KC_METRICS_ENABLED
ARG KC_DB
ARG KC_HTTP_RELATIVE_PATH
ENV KC_HEALTH_ENABLED=$KC_HEALTH_ENABLED
ENV KC_METRICS_ENABLED=$KC_METRICS_ENABLED
ENV KC_DB=$KC_DB
ENV KC_HTTP_RELATIVE_PATH=$KC_HTTP_RELATIVE_PATH

# Install custom providers
COPY --chown=keycloak:keycloak build/image/openremote-theme-provider.jar /opt/keycloak/providers
COPY --chown=keycloak:keycloak build/image/openremote-self-register-configure-event-listener.jar /opt/keycloak/providers

WORKDIR /opt/keycloak

# Build custom image and copy into this new image
RUN /opt/keycloak/bin/kc.sh build

FROM keycloak/keycloak:${VERSION}

# Reinstate build args in case starting in dev mode
ARG KC_HEALTH_ENABLED
ARG KC_METRICS_ENABLED
ARG KC_DB
ARG KC_HTTP_RELATIVE_PATH
ENV KC_HEALTH_ENABLED=$KC_HEALTH_ENABLED
ENV KC_METRICS_ENABLED=$KC_METRICS_ENABLED
ENV KC_DB=$KC_DB
ENV KC_HTTP_RELATIVE_PATH=$KC_HTTP_RELATIVE_PATH

# Copy custom build
COPY --from=builder /opt/keycloak/ /opt/keycloak/

# Copy RPM packages
COPY --from=ubi-micro-build /mnt/rootfs /

# Create standard deployment path and symlink themes (cannot --spi-theme-dir=/deployment/keycloak/themes)
USER 0
RUN mkdir -p /deployment/keycloak/themes
RUN rm -r /opt/keycloak/themes
RUN ln -s /deployment/keycloak/themes /opt/keycloak
RUN chown keycloak:root /deployment/keycloak/themes
RUN chown keycloak:root /opt/keycloak/themes
USER 1000

# Configure runtime options
ENV TZ=Europe/Amsterdam
ENV KC_DB_URL_HOST=postgresql
ENV KC_DB_URL_PORT=5432
ENV KC_DB_URL_DATABASE=openremote
ENV KC_DB_SCHEMA=public
ENV KC_DB_USERNAME=postgres
ENV KC_DB_PASSWORD=postgres
ENV KC_HTTP_ENABLED=true
ENV KC_LOG_CONSOLE_FORMAT='%-5p [%c] (%t) %s%e%n'
ENV KC_PROXY_HEADERS=xforwarded
ENV KC_LOG_LEVEL=info
ENV KC_BOOTSTRAP_ADMIN_USERNAME=admin
ENV KC_BOOTSTRAP_ADMIN_PASSWORD=secret
ENV KEYCLOAK_SELF_REGISTERED_USER_ROLES="{ }"

HEALTHCHECK --interval=3s --timeout=3s --start-period=30s --retries=120 CMD curl --head -fsS http://localhost:9000/auth/health/ready || exit 1

EXPOSE 8080

ENTRYPOINT exec /opt/keycloak/bin/kc.sh ${KEYCLOAK_START_COMMAND:-start} --spi-events-listener-self-register-user-configure-self-registered-user-roles="${KEYCLOAK_SELF_REGISTERED_USER_ROLES:-}" ${KEYCLOAK_START_OPTS:-}
