if (location.hash) {
  const fragmentMarkup = decodeURIComponent(location.hash.slice(1));
  document.getElementById("fragmentContent").innerHTML = fragmentMarkup;
}

const candidate = window.demoConfig;
const script = document.createElement("script");
script.src = candidate.href;
document.head.appendChild(script);

document.getElementById("status").textContent =
  candidate instanceof Element
    ? "window.demoConfig resolves to the fragment-created anchor."
    : "No demoConfig named property was found.";
