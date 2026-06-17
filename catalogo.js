// Tokio Sushi - Base de Datos Estática (Configuración de Usuarios y Menú)

const USUARIOS_SISTEMA = [
    { username: "super_admin", pin: "9999", nombre: "Propietario", rol: "superadmin" },
    { username: "gerente_tokio", pin: "5555", nombre: "Gerente de Turno", rol: "admin" },
    { username: "cajero_carlos", pin: "1234", nombre: "Carlos Gómez", rol: "cajero" },
    { username: "cajero_maria", pin: "2345", nombre: "María Delgado", rol: "cajero" }
];

const CATALOGO_PRODUCTOS = [
    { id: "c1", name: "Combo Económico Arroz Tres Carnes", price: 6.19 },
    { id: "c2", name: "Combo Económico Arroz Oriental", price: 6.19 },
    { id: "c3", name: "Promoción Ebby Roll (20 piezas)", price: 9.19 },
    { id: "c4", name: "Combo Fusión Familiar", price: 17.69 },
    { id: "p1", name: "Arroz Especial (Pollo y Camarón)", price: 8.20 },
    { id: "p2", name: "Arroz 3 Carnes (Pollo, Carne, Cerdo)", price: 8.20 },
    { id: "p3", name: "Tallarines de Carne y Camarón", price: 8.20 },
    { id: "p4", name: "Pollo Agridulce con Papas", price: 8.20 },
    { id: "s1", name: "Nozomi Roll Tempura (12 pzs)", price: 6.69 },
    { id: "s2", name: "Okinawa Roll Tempura (12 pzs)", price: 6.69 },
    { id: "s3", name: "Hiroshima Roll Tempura (12 pzs)", price: 6.69 },
    { id: "e1", name: "Wakame (100g)", price: 4.50 },
    { id: "e2", name: "Papas Cheddar", price: 4.00 },
    { id: "e3", name: "Pepsi Grande (1.3 Litros)", price: 2.00 },
    { id: "e4", name: "Pepsi Mediana (1 Litro)", price: 1.50 },
    { id: "e5", name: "Salsa de Anguila Extra", price: 0.50 },
    { id: "e6", name: "Salsa Fuji Extra", price: 0.50 }
];
