// Keep startup failures visible even if a module cannot load in this browser.
(function () {
  function fail(error) {
    var note = document.getElementById('notice');
    note.hidden = false;
    note.textContent = 'Lighttext could not start: ' + (error && error.message || error) + '. Please share this message and your browser name.';
    document.getElementById('play').disabled = true;
  }
  window.addEventListener('error', function (event) { if (event.error) fail(event.error); });
  window.addEventListener('unhandledrejection', function (event) { fail(event.reason); });
  import('./app.js?v=2.0.0').catch(fail);
})();
