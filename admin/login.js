document.getElementById("admin-login").addEventListener("submit", function(e) {
    e.preventDefault();

    const user = document.getElementById("usuario").value.trim();
    const pass = document.getElementById("clave").value.trim();

    // Usuario y contraseña TEMPORALES
    const adminUser = "admin";
    const adminPass = "1234";

    if (user === adminUser && pass === adminPass) {
        // Guardamos sesión simple
        localStorage.setItem("adminLogged", "true");

        // Redirigimos al dashboard
        window.location.href = "dashboard.html";
    } else {
        alert("Usuario o contraseña incorrectos");
    }
});
