/*
 * Bridges the OpenRemote design system's button to native form submission.
 *
 * Vaadin's button is a custom element with role="button": it has no `type` and is not a
 * form-associated element, so it cannot submit a form by itself. Every submit rendered by
 * field.ftl therefore pairs an <or-vaadin-button> with a native <button type="submit">
 * that carries the real name/value.
 *
 * Clicking the styled button forwards to the native one via requestSubmit(submitter), so
 * the submitter's name/value are included in the payload — Keycloak detects several flags
 * purely by presence (cancel-aia, tryAnotherWay), so dropping them would change behaviour.
 *
 * Enter-to-submit needs no code here: the native button stays in the DOM as the form's
 * default button even while visually hidden.
 */
(function () {
  "use strict";

  document.addEventListener("click", function (event) {
    var styled = event.target.closest && event.target.closest(".or-submit__styled");

    if (!styled) {
      return;
    }

    var fallback = styled.parentElement
      && styled.parentElement.querySelector(".or-submit__fallback");
    var form = fallback && fallback.form;

    if (!form) {
      return;
    }

    event.preventDefault();

    if (typeof form.requestSubmit === "function") {
      form.requestSubmit(fallback);
    } else {
      // Older browsers: click the native button so it still acts as the submitter.
      fallback.click();
    }
  });

  // Double-submit protection. Applied on the submit event rather than via an onsubmit
  // attribute on the button, because disabling the submitter before the browser has
  // collected form data would drop its name/value from the payload.
  document.addEventListener(
    "submit",
    function (event) {
      var form = event.target;

      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      if (form.dataset.orSubmitted === "true") {
        event.preventDefault();
        return;
      }

      form.dataset.orSubmitted = "true";
      form.classList.add("or-form--submitting");
    },
    true
  );
})();
