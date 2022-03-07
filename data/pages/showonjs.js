'use strict';

/** Shows tagged elements that require Javascript. */
function showJsRequiredElements() {
  const jsElements = Array.from(document.getElementsByClassName('show-on-js'));
  for (const element of jsElements) {
    element.insertAdjacentHTML('afterend', element.innerHTML);
    element.remove();
  }
}

showJsRequiredElements();
