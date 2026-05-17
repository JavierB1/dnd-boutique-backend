// Catálogo de combos de DND Boutique
// Actualiza estos datos cuando cambies tus combos

const combos = [
  {
    id: 1,
    nombre: "Combo Dúo",
    descripcion: "2 perfumes a elegir de nuestra colección",
    precio: 25,
    disponible: true,
  },
  {
    id: 2,
    nombre: "Combo Trío",
    descripcion: "3 perfumes a elegir de nuestra colección",
    precio: 35,
    disponible: true,
  },
  {
    id: 3,
    nombre: "Combo Premium",
    descripcion: "2 perfumes de nuestra línea premium",
    precio: 45,
    disponible: true,
  },
  {
    id: 4,
    nombre: "Combo Familiar",
    descripcion: "5 perfumes variados para toda la familia",
    precio: 55,
    disponible: false,
  },
];

const getCombosActivos = () => combos.filter((c) => c.disponible);

const getCombosTexto = () => {
  const activos = getCombosActivos();
  return activos
    .map((c) => `• *${c.nombre}* - $${c.precio}\n  ${c.descripcion}`)
    .join("\n");
};

module.exports = { combos, getCombosActivos, getCombosTexto };
