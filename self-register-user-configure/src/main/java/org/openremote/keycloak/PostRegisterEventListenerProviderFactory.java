package org.openremote.keycloak;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.jboss.logging.Logger;
import org.keycloak.Config;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.EventListenerProviderFactory;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;

public class PostRegisterEventListenerProviderFactory implements EventListenerProviderFactory {
    private static final Logger LOG = Logger.getLogger(PostRegisterEventListenerProviderFactory.class);

    public static final String PROVIDER_ID = "self-register-user-configure";

    private static final String CONFIG_ROLES_CONFIG = "self-registered-user-roles";

    private SelfRegisteredUserRoles assignedRoles;

    @Override
    public EventListenerProvider create(KeycloakSession session) {
        return new PostRegisterEventListenerProvider(session, assignedRoles);
    }

    @Override
    public void init(Config.Scope config) {
        String rolesConfigurationJSON = config.get(CONFIG_ROLES_CONFIG);

        ObjectMapper mapper = new ObjectMapper();
        try {
            SelfRegisteredUserRoles roles = mapper.readValue(rolesConfigurationJSON, SelfRegisteredUserRoles.class);
            assignedRoles = roles;
        } catch (JsonProcessingException e) {
            LOG.error("Failed to parse self registered roles configuration " + rolesConfigurationJSON, e);
            assignedRoles = new SelfRegisteredUserRoles();
        }
    }

    @Override
    public void postInit(KeycloakSessionFactory factory) {
    }

    @Override
    public void close() {
    }

    @Override
    public String getId() {
        return PROVIDER_ID;
    }
}