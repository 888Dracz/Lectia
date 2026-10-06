// Textos para entrenar: fragmentos clásicos de dominio público, textos propios
// de Campanita o el libro que estés leyendo.
import { openBookContent } from "../books/load";
import type { BookMeta } from "../books/types";

export interface TrainingText {
  title: string;
  author: string;
  text: string;
}

export const CLASSICS: TrainingText[] = [
  {
    title: "Don Quijote de la Mancha (cap. I)",
    author: "Miguel de Cervantes",
    text:
      "En un lugar de la Mancha, de cuyo nombre no quiero acordarme, no ha mucho tiempo que vivía un hidalgo de los de lanza en astillero, adarga antigua, rocín flaco y galgo corredor. " +
      "Una olla de algo más vaca que carnero, salpicón las más noches, duelos y quebrantos los sábados, lantejas los viernes, algún palomino de añadidura los domingos, consumían las tres partes de su hacienda. " +
      "Tenía en su casa una ama que pasaba de los cuarenta, y una sobrina que no llegaba a los veinte, y un mozo de campo y plaza, que así ensillaba el rocín como tomaba la podadera. " +
      "Frisaba la edad de nuestro hidalgo con los cincuenta años; era de complexión recia, seco de carnes, enjuto de rostro, gran madrugador y amigo de la caza. " +
      "Es, pues, de saber que este sobredicho hidalgo, los ratos que estaba ocioso, que eran los más del año, se daba a leer libros de caballerías con tanta afición y gusto, que olvidó casi de todo punto el ejercicio de la caza, y aun la administración de su hacienda. " +
      "En resolución, él se enfrascó tanto en su lectura, que se le pasaban las noches leyendo de claro en claro, y los días de turbio en turbio. " +
      "Y así, del poco dormir y del mucho leer, se le secó el celebro, de manera que vino a perder el juicio.",
  },
  {
    title: "Lazarillo de Tormes (tratado primero)",
    author: "Anónimo",
    text:
      "Pues sepa Vuestra Merced ante todas cosas que a mí llaman Lázaro de Tormes, hijo de Tomé González y de Antona Pérez, naturales de Tejares, aldea de Salamanca. " +
      "Mi nacimiento fue dentro del río Tormes, por la cual causa tomé el sobrenombre. " +
      "Mi padre tenía cargo de proveer una molienda de una aceña que está ribera de aquel río, en la cual fue molinero más de quince años. " +
      "Estando mi madre una noche en la aceña, preñada de mí, tomóle el parto y parióme allí, de manera que con verdad puedo decir nacido en el río.",
  },
  {
    title: "La biblioteca del faro",
    author: "Textos de Campanita",
    text:
      "En lo alto de un acantilado había un faro que, en lugar de guardar aceite y herramientas, guardaba libros. " +
      "La farera subía cada tarde los ciento doce escalones con una lámpara en una mano y una novela en la otra. " +
      "Decía que la luz del faro servía para los barcos, pero que la luz de los libros servía para todo lo demás. " +
      "Los pescadores del pueblo, al principio, se reían de ella; después empezaron a pedirle prestado algún tomo para las noches largas de invierno. " +
      "Con el tiempo, el faro se llenó de visitantes que llegaban por el camino de piedra buscando historias de viajes, de amores imposibles y de islas que no figuraban en ningún mapa. " +
      "Una noche de tormenta se apagó la gran lámpara y la farera no supo qué hacer. " +
      "Entonces los vecinos encendieron velas en cada ventana del faro, y la torre entera brilló como un libro abierto sobre el mar. " +
      "Los barcos regresaron sanos y salvos, guiados por cientos de pequeñas llamas. " +
      "Desde aquel día, en el pueblo se dice que una biblioteca encendida puede salvar más vidas de las que imaginamos.",
  },
  {
    title: "Cómo leen los ojos",
    author: "Textos de Campanita",
    text:
      "Cuando leemos, los ojos no se deslizan suavemente sobre la línea, como podríamos pensar. " +
      "En realidad avanzan a saltos rápidos llamados movimientos sacádicos, y se detienen un instante en ciertos puntos que se conocen como fijaciones. " +
      "Durante cada fijación el cerebro capta una palabra completa y, con algo de práctica, también parte de las palabras vecinas. " +
      "Las personas que leen con rapidez no tienen ojos especiales: simplemente hacen menos fijaciones por línea y vuelven atrás con menos frecuencia. " +
      "Volver atrás sin necesidad, lo que se llama regresión, es uno de los hábitos que más frena la lectura. " +
      "Otro freno habitual es pronunciar mentalmente cada palabra, como si leyéramos en voz alta para nosotros mismos. " +
      "Los ejercicios de lectura rápida entrenan justamente estas habilidades: ampliar el campo visual, reducir las regresiones y confiar en la comprensión. " +
      "Sin embargo, la velocidad nunca debe ser el único objetivo. " +
      "Leer bien significa entender, recordar y disfrutar, y a veces eso exige detenerse en una frase hermosa y leerla dos veces.",
  },
  {
    title: "Breve historia del libro",
    author: "Textos de Campanita",
    text:
      "Antes de los libros hubo tablillas de arcilla, rollos de papiro y pergaminos hechos con piel de animales. " +
      "Los romanos empezaron a coser hojas por un lado y así nació el códice, el antepasado directo del libro que conocemos. " +
      "Durante siglos, cada ejemplar se copiaba a mano en los monasterios, letra por letra, con tinta y pluma. " +
      "Un solo libro podía tardar meses en terminarse y costaba tanto como una casa. " +
      "La imprenta de tipos móviles, perfeccionada en Europa a mediados del siglo quince, cambió esa historia para siempre. " +
      "De pronto los libros podían fabricarse por cientos, las ideas viajaban más rápido y cada vez más personas aprendían a leer. " +
      "Hoy un teléfono puede guardar miles de libros en el bolsillo, pero el gesto sigue siendo el mismo de hace dos mil años. " +
      "Alguien escribe, alguien lee, y entre ambos se abre un pequeño puente que atraviesa el tiempo y la distancia.",
  },
  {
    title: "El bosque de las palabras",
    author: "Textos de Campanita",
    text:
      "Había una vez un bosque donde los árboles, en lugar de hojas, tenían palabras. " +
      "En primavera brotaban verbos nuevos que se movían con el viento, y en otoño caían adjetivos dorados que crujían bajo los pies. " +
      "Una niña llamada Celeste visitaba el bosque cada mañana con una cesta vacía. " +
      "Recogía las palabras más bonitas que encontraba en el suelo y por la noche las ordenaba sobre la mesa de la cocina. " +
      "A veces formaban un poema, otras veces una receta, y una vez formaron un mapa que llevaba a un río escondido. " +
      "Su abuelo le explicó que las palabras sueltas no sirven de mucho, pero que juntas pueden construir cualquier cosa. " +
      "Celeste creció, se hizo escritora y nunca olvidó aquella lección. " +
      "Todavía hoy, cuando no sabe cómo empezar una historia, sale a caminar y espera a que una palabra le caiga en el hombro.",
  },
];

export function classicsText(): string {
  return CLASSICS.map((c) => c.text).join("\n\n");
}

/** Texto para entrenar a partir de un libro, desde donde vas leyendo. */
export async function bookTrainingText(meta: BookMeta, minChars = 7000): Promise<string> {
  const content = await openBookContent(meta);
  const total = content.kind === "pdf" ? content.numPages : content.chapters.length;
  if (content.kind === "reflow" && content.fixedLayout) return "";
  const start = Math.min(total - 1, Math.max(0, meta.location?.chapter ?? 0));
  let text = "";
  for (let k = 0; k < total && text.length < minChars; k++) {
    const i = (start + k) % total;
    const t = await content.getText(i);
    if (t.trim().length > 40) text += (text ? "\n\n" : "") + t;
  }
  return text;
}

export async function trainingText(source: string, books: Record<string, BookMeta>): Promise<{ text: string; label: string }> {
  const meta = books[source];
  if (meta) {
    try {
      const text = await bookTrainingText(meta);
      if (text.length > 400) return { text, label: meta.title };
    } catch {
      /* se usa el texto clásico */
    }
  }
  return { text: classicsText(), label: "Textos clásicos" };
}
