package org.openremote.keycloak;

import org.jboss.logging.Logger;
import org.keycloak.Config;
import org.keycloak.authentication.RequiredActionFactory;
import org.keycloak.authentication.RequiredActionProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.models.UserModel;

/**
 * Copied from https://github.com/m-serag-lab/keycloak-change-password/blob/main/src/main/java/com/seraglab/CustomUpdatePasswordFactory.java
 * in order to check for the current password when updating it.
 */
public class ORUpdatePasswordFactory implements RequiredActionFactory {

    private static final Logger LOG = Logger.getLogger(ORUpdatePasswordFactory.class);

    @Override
    public RequiredActionProvider create(KeycloakSession session) {
        LOG.info("Creating ORUpdatePassword");
        return new ORUpdatePassword(session);
    }

    @Override
    public void init(Config.Scope scope) {
        // Do nothing
    }

    @Override
    public void postInit(KeycloakSessionFactory keycloakSessionFactory) {
        // Do nothing
    }

    @Override
    public void close() {
        // Do nothing
    }

    @Override
    public String getId() {
        return UserModel.RequiredAction.UPDATE_PASSWORD.name();
    }

    @Override
    public String getDisplayText() {
        return "OpenRemote Update Password";
    }
}
