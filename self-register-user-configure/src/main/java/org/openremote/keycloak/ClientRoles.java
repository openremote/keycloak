package org.openremote.keycloak;

import java.util.List;

public class ClientRoles {
    private String client;
    private List<String> roles;

    public String getClient() {
        return client;
    }

    public void setClient(String client) {
        this.client = client;
    }

    public List<String> getRoles() {
        return roles;
    }

    public void setRoles(List<String> roles) {
        this.roles = roles;
    }
}
