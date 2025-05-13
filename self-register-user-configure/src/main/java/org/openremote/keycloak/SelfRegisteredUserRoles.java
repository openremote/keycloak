package org.openremote.keycloak;

import java.util.List;

public class SelfRegisteredUserRoles {
    List<String> realmRoles;
    List<ClientRoles> clientRoles;

    public List<String> getRealmRoles() {
        return realmRoles;
    }

    public void setRealmRoles(List<String> realmRoles) {
        this.realmRoles = realmRoles;
    }

    public List<ClientRoles> getClientRoles() {
        return clientRoles;
    }

    public void setClientRoles(List<ClientRoles> clientRoles) {
        this.clientRoles = clientRoles;
    }
}
