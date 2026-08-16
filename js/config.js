/**
 * config.js
 * The ONE thing you must edit before this app will work.
 *
 * After deploying the Apps Script backend as a Web App (see README step 3),
 * paste the Web App URL below. It looks like:
 *   https://script.google.com/macros/s/AKfycb.../exec
 *
 * IMPORTANT: every HTML page loads every local .js/.css file with a
 * "?v=3" query string - that exists purely to stop browsers from caching
 * an old copy after you push an update (all of them, not just this file -
 * app.js/coach.js/student.js/admin.js/styles.css previously had NO cache-
 * busting at all, which meant returning visitors could keep running old
 * code indefinitely after a deploy). Whenever you edit ANY .js or .css
 * file in the future, bump the number (v=4, v=5, ...) on every <script>/
 * <link> tag that loads it, across every .html file, so visitors are
 * guaranteed to get your latest change instead of a stale cached one.
 */
window.BYD_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbx8q3GwGB2U2fRpLP0UG8SwVrmlWuDmp7NogE1atvNR7Tv05ZoGoINi-geFhTZbpAiZ/exec'
};
