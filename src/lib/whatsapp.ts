const moneda = (n: number) =>
  n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const normalizarTelefonoPE = (telefono: string) => {
  const digitos = telefono.replace(/\D+/g, "");
  const sinCero = digitos.startsWith("0") ? digitos.slice(1) : digitos;
  if (sinCero.startsWith("51")) return sinCero;
  return `51${sinCero}`;
};

export const crearLinkWhatsApp = (telefono: string, mensaje: string) =>
  `https://wa.me/${normalizarTelefonoPE(telefono)}?text=${encodeURIComponent(mensaje)}`;

export function mensajeComprobante(p: {
  nombres: string;
  montoPagado: number;
  numeroCuota: number;
  saldoPendiente: number;
}) {
  return `Hola ${p.nombres}, confirmamos la recepción de tu pago de S/ ${moneda(p.montoPagado)} correspondiente a la cuota #${p.numeroCuota}. Tu saldo pendiente es S/ ${moneda(p.saldoPendiente)}. ¡Gracias!`;
}