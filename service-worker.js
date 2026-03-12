self.addEventListener("install", function(event) {
event.waitUntil(
caches.open("pokemon-app").then(function(cache) {
return cache.addAll([
"/",
"/index.html",
"/style.css",
"/app.js"
]);
})
);
});