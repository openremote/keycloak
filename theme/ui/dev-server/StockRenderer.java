import com.fasterxml.jackson.databind.ObjectMapper;

import freemarker.cache.FileTemplateLoader;
import freemarker.cache.MultiTemplateLoader;
import freemarker.cache.TemplateLoader;
import freemarker.core.HTMLOutputFormat;
import freemarker.template.Configuration;
import freemarker.template.DefaultObjectWrapper;
import freemarker.template.Template;
import freemarker.template.TemplateBooleanModel;
import freemarker.template.TemplateException;
import freemarker.template.TemplateExceptionHandler;
import freemarker.template.TemplateMethodModelEx;
import freemarker.template.TemplateModel;
import freemarker.template.TemplateModelException;
import freemarker.template.TemplateNumberModel;
import freemarker.template.TemplateScalarModel;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.io.Reader;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.MessageFormat;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Properties;

/*
 * Dev-only: renders Keycloak's own login templates outside Keycloak, from the dev server's mock data.
 *
 * This is what lets the dev server show a stock Keycloak page next to ours - and a page this theme
 * does not implement in place of a placeholder - without running Keycloak. The templates are
 * Keycloak's, extracted from its keycloak-themes jar by `./gradlew installDist`, so nothing about
 * them is reproduced here. What is reproduced is the small part of Keycloak's FreeMarker provider
 * that shapes the data a template sees; see keycloakBehavior() below.
 *
 * Run with the JDK's single-file source launcher, so there is no build step:
 *
 *   java -cp "lib/*" StockRenderer.java <themes dir>
 *
 * It stays running and answers one JSON request per line on stdin with one JSON response per line
 * on stdout - dev-server/stock.mjs is the other end:
 *
 *   {"id":1,"theme":"keycloak.v2","template":"login.ftl","locale":"en","model":{...}}
 *   {"id":1,"html":"<!DOCTYPE html>..."}         or  {"id":1,"error":"..."}
 *
 * The model is the mock as plain JSON. Everything this adds to it is in keycloakBehavior(), and
 * it is deliberately small: Keycloak's templates distinguish an absent value from an empty one
 * (`usernameHidden??`, `auth?has_content`), so a general "missing means empty" rule would change
 * what pages render. Each entry there is a value Keycloak's provider always sets.
 */
public class StockRenderer {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final Path themes;
    private final Map<String, Theme> loaded = new HashMap<>();

    StockRenderer(Path themes) {
        this.themes = themes;
    }

    public static void main(String[] args) throws IOException {
        StockRenderer renderer = new StockRenderer(Path.of(args[0]));
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        PrintStream out = new PrintStream(System.out, true, StandardCharsets.UTF_8);

        for (String line; (line = in.readLine()) != null; ) {
            if (line.isBlank()) {
                continue;
            }

            Object id = null;

            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> request = JSON.readValue(line, Map.class);
                id = request.get("id");

                @SuppressWarnings("unchecked")
                String html = renderer.render(
                        (String) request.get("theme"),
                        (String) request.get("template"),
                        (String) request.getOrDefault("locale", "en"),
                        (Map<String, Object>) request.get("model"));

                respond(out, id, "html", html);
            } catch (TemplateException e) {
                respond(out, id, "error", describe(e));
            } catch (Exception e) {
                respond(out, id, "error", e.getClass().getSimpleName() + ": " + e.getMessage());
            }
        }
    }

    /** One response per line, so the reader on the other end can split on newlines. */
    private static void respond(PrintStream out, Object id, String key, String value) throws IOException {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id", id);
        response.put(key, value);
        out.println(JSON.writeValueAsString(response));
    }

    /** One line a developer can act on, rather than FreeMarker's full report. */
    private static String describe(TemplateException e) {
        String expression = e.getBlamedExpressionString();
        String where = e.getTemplateSourceName() + " line " + e.getLineNumber();

        return expression != null
                ? "Keycloak's " + where + " needs `" + expression + "`, which this page's mock data does not provide."
                : where + ": " + e.getMessageWithoutStackTop().lines().findFirst().orElse("");
    }

    String render(String themeName, String template, String locale, Map<String, Object> model) throws IOException, TemplateException {
        Theme theme = loaded.computeIfAbsent(themeName, this::load);
        keycloakBehavior(model, theme, locale);

        Template t = theme.configuration.getTemplate(template);
        StringWriter html = new StringWriter();
        t.process(model, html);
        return html.toString();
    }

    /*
     * Members Keycloak's beans always have and Keycloakify's mocks leave out when they are falsey,
     * which makes a template reading one fail outright. Listed as data because that is all they are;
     * `attributesByName.*` is applied to each attribute of a user profile.
     */
    private static final Map<String, Map<String, Object>> ALWAYS_SET = Map.of(
            "", Map.of("passwordPolicies", Map.of()),
            "auth", Map.of("showUsername", false, "showResetCredentials", false, "showTryAnotherWayLink", false),
            "locale", Map.of("rtl", false),
            "profile", Map.of("html5DataAnnotations", Map.of()),
            "attributesByName.*", Map.of(
                    "multivalued", false, "readOnly", false, "required", false,
                    "annotations", Map.of(), "validators", Map.of(),
                    "html5DataAnnotations", Map.of(), "values", List.of()));

    /*
     * The parts of Keycloak's FreeMarkerLoginFormsProvider (and the beans it hands templates) that a
     * mock cannot carry. Keycloakify's mocks mirror Keycloak's template data closely - they are built
     * from it - but not exactly, and every rule below was found as a template failing to render.
     * They describe how Keycloak builds the data, not any one page, so none of them names a page.
     */
    @SuppressWarnings("unchecked")
    private static void keycloakBehavior(Map<String, Object> model, Theme theme, String locale) {
        /*
         * Keycloak only sets a top-level flag when it is on, and its templates test for presence -
         * `usernameHidden??`, `isAppInitiatedAction??`, `enableWebAuthnConditionalUI?has_content`.
         * Keycloakify writes the same flags as an explicit false, which FreeMarker counts as present.
         * Nested bean properties such as realm.rememberMe are read directly and keep their value.
         */
        model.values().removeIf(Boolean.FALSE::equals);

        model.put("properties", theme.properties);
        model.put("lang", locale);
        model.putIfAbsent("darkMode", Boolean.parseBoolean(String.valueOf(theme.properties.getOrDefault("darkMode", "false"))));

        Properties messages = theme.messages(locale);
        model.put("msg", (TemplateMethodModelEx) args -> format(messages, str(args.get(0)), args.subList(1, args.size())));
        model.put("advancedMsg", (TemplateMethodModelEx) args -> {
            String key = str(args.get(0));
            if (key.startsWith("${") && key.endsWith("}")) {
                key = key.substring(2, key.length() - 1);
            }
            return messages.containsKey(key) ? format(messages, key, args.subList(1, args.size())) : key;
        });
        // Keycloak sanitizes admin-authored HTML here. Mock data is not user input.
        model.put("kcSanitize", (TemplateMethodModelEx) args -> str(args.get(0)));

        /*
         * MessagesPerFieldBean. The harness has no per-field errors, so these answer "none" - but they
         * have to exist, because the templates call them.
         */
        model.put("messagesPerField", Map.of(
                "existsError", (TemplateMethodModelEx) args -> false,
                "exists", (TemplateMethodModelEx) args -> false,
                "get", (TemplateMethodModelEx) args -> "",
                "getFirstError", (TemplateMethodModelEx) args -> "",
                "printIfExists", (TemplateMethodModelEx) args -> ""));

        alwaysSet(model, "");
        alwaysSet(model.get("auth"), "auth");
        alwaysSet(model.get("locale"), "locale");
        alwaysSet(model.get("profile"), "profile");

        /*
         * The two that are derivations rather than defaults: LocaleBean.current is the current
         * language's display name, and ProfileBean carries its attributes as a list while the mocks
         * keep only the by-name map.
         */
        if (model.get("locale") instanceof Map<?, ?> localeBean) {
            Map<String, Object> bean = (Map<String, Object>) localeBean;
            Object tag = bean.get("currentLanguageTag");
            bean.putIfAbsent("current", label(bean.get("supported"), tag));
        }

        if (model.get("profile") instanceof Map<?, ?> profileBean
                && profileBean.get("attributesByName") instanceof Map<?, ?> byName) {
            ((Map<String, Object>) profileBean).putIfAbsent("attributes", new ArrayList<>(byName.values()));
            byName.values().forEach(attribute -> alwaysSet(attribute, "attributesByName.*"));
        }
    }

    /** Adds the members Keycloak always sets on this bean, leaving anything the mock has alone. */
    @SuppressWarnings("unchecked")
    private static void alwaysSet(Object bean, String path) {
        if (bean instanceof Map<?, ?> map) {
            ALWAYS_SET.getOrDefault(path, Map.of()).forEach(((Map<String, Object>) map)::putIfAbsent);
        }
    }

    /** The label `supported` gives for `tag`, or the tag itself. */
    private static String label(Object supported, Object tag) {
        if (supported instanceof List<?> languages) {
            for (Object entry : languages) {
                if (entry instanceof Map<?, ?> language && Objects.equals(language.get("languageTag"), tag)) {
                    return String.valueOf(language.get("label"));
                }
            }
        }
        return String.valueOf(tag);
    }

    /** A theme and its parents, loaded the way Keycloak resolves them: `parent=` in theme.properties. */
    private Theme load(String name) {
        try {
            List<Path> chain = new ArrayList<>();
            for (String current = name; current != null; ) {
                Path dir = themes.resolve(current).resolve("login");
                if (!Files.isDirectory(dir)) {
                    throw new IOException("No login theme `" + current + "` under " + themes);
                }
                chain.add(dir);
                current = properties(dir.resolve("theme.properties")).getProperty("parent");
            }
            return new Theme(chain);
        } catch (IOException e) {
            throw new IllegalStateException(e.getMessage(), e);
        }
    }

    private static final class Theme {
        /** Child first: keycloak.v2, then base. */
        final List<Path> chain;
        final Map<String, Object> properties = new HashMap<>();
        final Configuration configuration = new Configuration(Configuration.VERSION_2_3_32);
        private final Map<String, Properties> messagesByLocale = new HashMap<>();

        Theme(List<Path> chain) throws IOException {
            this.chain = chain;

            // Parent first, so a child's value wins - the same merge Keycloak does.
            for (int i = chain.size() - 1; i >= 0; i--) {
                properties(chain.get(i).resolve("theme.properties")).forEach((k, v) -> properties.put((String) k, v));
            }

            List<TemplateLoader> loaders = new ArrayList<>();
            for (Path dir : chain) {
                loaders.add(new FileTemplateLoader(dir.toFile()));
            }
            configuration.setTemplateLoader(new MultiTemplateLoader(loaders.toArray(new TemplateLoader[0])));
            configuration.setObjectWrapper(new CallableWrapper());
            configuration.setOutputFormat(HTMLOutputFormat.INSTANCE);
            configuration.setDefaultEncoding("UTF-8");
            configuration.setTemplateExceptionHandler(TemplateExceptionHandler.RETHROW_HANDLER);
            configuration.setLogTemplateExceptions(false);
        }

        /** English underneath the requested language, so a key missing from a translation still resolves. */
        Properties messages(String locale) {
            return messagesByLocale.computeIfAbsent(locale, tag -> {
                Properties merged = new Properties();
                for (String bundle : tag.equals("en") ? List.of("en") : List.of("en", tag.replace('-', '_'))) {
                    for (int i = chain.size() - 1; i >= 0; i--) {
                        try {
                            merged.putAll(properties(chain.get(i).resolve("messages/messages_" + bundle + ".properties")));
                        } catch (IOException e) {
                            throw new IllegalStateException(e);
                        }
                    }
                }
                return merged;
            });
        }
    }

    private static Properties properties(Path path) throws IOException {
        Properties properties = new Properties();
        if (Files.exists(path)) {
            try (Reader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
                properties.load(reader);
            }
        }
        return properties;
    }

    private static String str(Object value) throws TemplateModelException {
        if (value instanceof TemplateScalarModel scalar) {
            return scalar.getAsString();
        }
        if (value instanceof TemplateNumberModel number) {
            return number.getAsNumber().toString();
        }
        return String.valueOf(value);
    }

    /** Keycloak's messages are MessageFormat patterns, with '' for a literal apostrophe. */
    private static String format(Properties messages, String key, List<?> args) throws TemplateModelException {
        String pattern = messages.getProperty(key);
        if (pattern == null) {
            return key;
        }
        Object[] values = new Object[args.size()];
        for (int i = 0; i < values.length; i++) {
            values[i] = str(args.get(i));
        }
        return new MessageFormat(pattern.replace("'", "''").replace("''''", "''")).format(values);
    }

    /*
     * Keycloak's beans expose values both as properties and as methods - `auth.showUsername` and
     * `auth.showUsername()` are both valid against the real AuthenticationContextBean - while JSON can
     * only carry the value. Every scalar is therefore also callable with no arguments, returning itself.
     */
    private static final class CallableWrapper extends DefaultObjectWrapper {
        CallableWrapper() {
            super(Configuration.VERSION_2_3_32);
        }

        @Override
        public TemplateModel wrap(Object value) throws TemplateModelException {
            if (value instanceof Boolean b) {
                return new CallableBoolean(b);
            }
            if (value instanceof String s) {
                return new CallableString(s);
            }
            return super.wrap(value);
        }
    }

    private record CallableBoolean(boolean value) implements TemplateBooleanModel, TemplateMethodModelEx {
        public boolean getAsBoolean() {
            return value;
        }

        public Object exec(@SuppressWarnings("rawtypes") List args) {
            return this;
        }
    }

    private record CallableString(String value) implements TemplateScalarModel, TemplateMethodModelEx {
        public String getAsString() {
            return value;
        }

        public Object exec(@SuppressWarnings("rawtypes") List args) {
            return this;
        }
    }
}
