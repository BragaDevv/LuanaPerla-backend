const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function geocodificarEndereco(enderecoCompleto) {
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(enderecoCompleto)}&key=${GOOGLE_MAPS_API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  console.log("[FRETE] geocoding response:", JSON.stringify(data, null, 2));

  if (!data?.results?.length) {
    throw new Error("Endereço não encontrado no Geocoding.");
  }

  const location = data.results[0]?.geometry?.location;

  if (!location) {
    throw new Error("Coordenadas não encontradas no Geocoding.");
  }

  return {
    lat: location.lat,
    lng: location.lng,
    enderecoFormatado: data.results[0]?.formatted_address || enderecoCompleto,
  };
}

async function calcularRota({ origemLat, origemLng, destinoLat, destinoLng }) {
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
    },
    body: JSON.stringify({
      origin: {
        location: {
          latLng: {
            latitude: origemLat,
            longitude: origemLng,
          },
        },
      },
      destination: {
        location: {
          latLng: {
            latitude: destinoLat,
            longitude: destinoLng,
          },
        },
      },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      languageCode: "pt-BR",
      units: "METRIC",
    }),
  });

  const data = await response.json();

  console.log("[FRETE] routes response:", JSON.stringify(data, null, 2));

  const rota = data?.routes?.[0];

  if (!rota?.distanceMeters) {
    throw new Error("Não foi possível calcular a rota.");
  }

  return {
    distanceMeters: rota.distanceMeters,
    duration: rota.duration,
  };
}

function calcularValorFrete(distanceMeters) {
  const taxaBase = 6;
  const valorKm = 2.5;
  const freteMinimo = 8;

  const distanceKm = distanceMeters / 1000;
  const freteBruto = taxaBase + distanceKm * valorKm;
  const freteFinal = Math.max(freteMinimo, freteBruto);

  return {
    distanceKm: Number(distanceKm.toFixed(2)),
    taxaBase,
    valorKm,
    freteMinimo,
    frete: Number(freteFinal.toFixed(2)),
  };
}

module.exports = {
  geocodificarEndereco,
  calcularRota,
  calcularValorFrete,
};