package org.openremote.keycloak;

import org.jboss.logging.Logger;
import org.keycloak.events.Event;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.EventType;
import org.keycloak.events.admin.AdminEvent;
import org.keycloak.models.ClientModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.RoleModel;
import org.keycloak.models.UserModel;

public class PostRegisterEventListenerProvider implements EventListenerProvider {
    private static final Logger LOG = Logger.getLogger(PostRegisterEventListenerProvider.class);

    private SelfRegisteredUserRoles assignedRoles;
    private final KeycloakSession session;

    public PostRegisterEventListenerProvider(KeycloakSession session, SelfRegisteredUserRoles assignedRoles) {
        this.session = session;
        this.assignedRoles = assignedRoles;
    }

    @Override
    public void onEvent(Event event) {
        if (EventType.REGISTER.equals(event.getType())) {
            String userId = event.getUserId();
            RealmModel realm = session.getContext().getRealm();
            UserModel user = session.users().getUserById(realm, userId);

            LOG.info("Registering user " + user.getUsername());

            for (String role : assignedRoles.getRealmRoles()) {
                grantRealmRole(role, realm, user);
            }

            for (ClientRoles clientRoles : assignedRoles.getClientRoles()) {
                ClientModel client = realm.getClientByClientId(clientRoles.getClient());
                if (client != null) {
                    for (String role : clientRoles.getRoles()) {
                        grantClientRole(user, client, role);
                    }
                } else {
                    LOG.warn("Client " + clientRoles.getClient() + " not found");
                }
            }
        }
    }

    private static void grantRealmRole(String role, RealmModel realm, UserModel user) {
        RoleModel realmRole = realm.getRole(role);
        if (realmRole != null) {
            user.grantRole(realmRole);
            LOG.info("Granted realm role " + realmRole.getName());
        } else {
            LOG.warn("Realm role " + role + " not found");
        }
    }

    private void grantClientRole(UserModel user, ClientModel client, String roleName) {
        RoleModel role = client.getRole(roleName);
        if (role != null) {
            user.grantRole(role);
            LOG.info("Granted role " + client.getName() + " - " + role.getName());
        } else {
            LOG.warn("Role " + client.getName() + " - " + roleName + " not found");
        }
    }

    @Override
    public void onEvent(AdminEvent adminEvent, boolean b) {}

    @Override
    public void close() {}

}
