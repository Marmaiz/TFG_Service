const cds = require("@sap/cds");
/* const { Entrada } = cds.entities; */

const REQUIRED_FIELDS = {
  Producto:["Nombre"],
  Calibre: ["Nombre", "Peso_Aprox_Pieza", "Producto_Id"],
  Caja: ["Nombre", "Peso"],
  Variedad: ["Nombre", "Producto_Id"],
  Socio: ["Nombre", "CIF", "Direccion", "Telefono"],
  Cliente: ["Nombre", "CIF", "Direccion", "Telefono"],
  Entrada: ["Producto_Id", "Variedad_Id", "Fecha_recogida", "Calibre_Id", "Socio_Id", "Kilos"],
};

function isValidSpanishNIF(value) {
  if (!value || typeof value !== "string") return false;
  const nif = value.toUpperCase().replace(/[^A-Z0-9]/g, "");

  const dniLetters = "TRWAGMYFPDXBNJZSQVHLCKE";

  const dni = nif.match(/^([0-9]{8})([A-Z])$/);
  if (dni) {
    const num = parseInt(dni[1], 10);
    return dniLetters[num % 23] === dni[2];
  }

  const nie = nif.match(/^([XYZ])([0-9]{7})([A-Z])$/);
  if (nie) {
    const prefix = { X: "0", Y: "1", Z: "2" }[nie[1]];
    const num = parseInt(prefix + nie[2], 10);
    return dniLetters[num % 23] === nie[3];
  }

  const cif = nif.match(/^[ABCDEFGHJKLMNPQRSUVW][0-9]{7}[0-9A-J]$/);
  if (cif) {
    return true;
  }

  return false;
}

function isValidTelefono(value) {
  if (!value || typeof value !== "string") return false;
  const clean = value.replace(/[^0-9+]/g, "");
  return /^(\+34)?[6789][0-9]{8}$/.test(clean);
}

function checkRequiredFields(entityName, data, req) {
  const required = REQUIRED_FIELDS[entityName];
  if (!required) return;
  const missing = required.filter(
    (field) => data[field] === undefined || data[field] === null || data[field] === "",
  );
  if (missing.length) {
    const missingFormatted = missing.map(field => field.replace(/_Id$/, "").replace(/_/g, " "));
    throw new Error(
      `Faltan campos obligatorios en ${entityName}: ${missingFormatted.join(", ")}`,
    );
  }

  if (entityName === "Socio" || entityName === "Cliente") {
    if (data.CIF && !isValidSpanishNIF(data.CIF)) {
      throw new Error("CIF/NIF inválido");
    }
    if (data.Telefono && !isValidTelefono(data.Telefono)) {
      throw new Error("Teléfono inválido");
    }
  }
}

async function validateEntradaDependencies(tx, productoId, variedadId, calibreId) {
  if (!productoId) return;

  if (variedadId) {
    const variedad = await tx
      .read("Variedad")
      .where({ Id: variedadId })
      .columns("Id", "Producto_Id");

    if (!variedad.length) {
      throw new Error("Variedad no encontrada");
    }

    if (variedad[0].Producto_Id !== productoId) {
      throw new Error("La variedad seleccionada no pertenece al producto indicado");
    }
  }

  if (calibreId) {
    const calibre = await tx
      .read("Calibre")
      .where({ Id: calibreId })
      .columns("Id", "Producto_Id");

    if (!calibre.length) {
      throw new Error("Calibre no encontrado");
    }

    if (calibre[0].Producto_Id !== productoId) {
      throw new Error("El calibre seleccionado no pertenece al producto indicado");
    }
  }
}

module.exports = (srv) => {
  async function cleanupTrazabilidadForLineas(tx, lineaIds) {
    if (!lineaIds?.length) return;

    const trazabilidades = await tx.run(
      SELECT.from("Trazabilidad")
        .columns("Id", "Entrada_Id", "Linea_Id", "Kilos_Usados", "Kilos_Merma")
        .where({ Linea_Id: { in: lineaIds } }),
    );

    if (!trazabilidades.length) return;

    const entradaDeltas = new Map();
    const lineaDeltas = new Map();

    for (const traz of trazabilidades) {
      const usados = Number(traz.Kilos_Usados || 0);
      const merma = Number(traz.Kilos_Merma || 0);
      const total = usados + merma;

      if (!entradaDeltas.has(traz.Entrada_Id)) {
        entradaDeltas.set(traz.Entrada_Id, { disponibles: 0, merma: 0 });
      }
      const entradaDelta = entradaDeltas.get(traz.Entrada_Id);
      entradaDelta.disponibles += total;
      entradaDelta.merma += merma;

      if (!lineaDeltas.has(traz.Linea_Id)) {
        lineaDeltas.set(traz.Linea_Id, { restantes: 0 });
      }
      const lineaDelta = lineaDeltas.get(traz.Linea_Id);
      lineaDelta.restantes += usados;
    }

    const entradaIds = Array.from(entradaDeltas.keys());
    const entradas = await tx.run(
      SELECT.from("Entrada")
        .columns("Id", "Kilos_disponibles", "Kilos_Merma")
        .where({ Id: { in: entradaIds } }),
    );

    for (const entrada of entradas) {
      const delta = entradaDeltas.get(entrada.Id);
      if (!delta) continue;

      await tx.run(
        UPDATE("Entrada")
          .set({
            Kilos_disponibles: Number(entrada.Kilos_disponibles || 0) + delta.disponibles,
            Kilos_Merma: Math.max(Number(entrada.Kilos_Merma || 0) - delta.merma, 0),
          })
          .where({ Id: entrada.Id }),
      );
    }

    const lineas = await tx.run(
      SELECT.from("Linea")
        .columns("Id", "Kilos_Restantes")
        .where({ Id: { in: lineaIds } }),
    );

    for (const linea of lineas) {
      const delta = lineaDeltas.get(linea.Id);
      if (!delta) continue;

      await tx.run(
        UPDATE("Linea")
          .set({
            Kilos_Restantes: Number(linea.Kilos_Restantes || 0) + delta.restantes,
          })
          .where({ Id: linea.Id }),
      );
    }

    await tx.run(
      DELETE.from("Trazabilidad").where({ Linea_Id: { in: lineaIds } }),
    );
  }

  srv.before(["CREATE", "UPDATE"], ["Producto", "Calibre", "Caja", "Variedad", "Socio", "Cliente", "Entrada"], (req) => {
    const entityName = req.target.name ? req.target.name.split(".").pop() : req.target;
    checkRequiredFields(entityName, req.data, req);
  });

  srv.before("CREATE", "Pedido", async (req) => {
    const data = req.data;
    const { Cliente_Id, Fecha_Pedido } = req.data;

    if (!Cliente_Id) throw new Error("Cliente requerido");

    if (Fecha_Pedido) {
      const pedidoDate = new Date(Fecha_Pedido);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      pedidoDate.setHours(0, 0, 0, 0);
      if (pedidoDate < today) {
        throw new Error("La fecha de pedido no puede ser anterior a hoy");
      }
    }

    const tx = cds.tx(req);
    const cliente = await tx
      .read("Cliente")
      .where({ Id: Cliente_Id })
      .columns("Nombre");

    if (!cliente.length || !cliente[0].Nombre)
      throw new Error("Cliente no encontrado");

    const prefix = cliente[0].Nombre.slice(0, 4).toUpperCase();
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const sec = Math.floor(Math.random() * 1000);

    req.data.Id_Display = `${prefix}-${date}-${sec.toString().padStart(3, "0")}`;
  });

   srv.before( "UPDATE", "Pedido", async (req) => {
    const data = req.data;
    const { Fecha_Pedido } = req.data;   

    if (Fecha_Pedido) {
      const pedidoDate = new Date(Fecha_Pedido);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      pedidoDate.setHours(0, 0, 0, 0);
      if (pedidoDate < today) {
        throw new Error("La fecha de pedido no puede ser anterior a hoy");
      }
    }
    
  });

  srv.before("CREATE", "Linea", async (req) => {
    const { Pedido_Id } = req.data;
    if (!Pedido_Id) throw new Error("Línea requiere Pedido_Id");

    const tx = cds.tx(req);

    // 1. Obtener ID_Display del Pedido (no UUID)
    const pedido = await tx
      .read("Pedido")
      .where({ Id: Pedido_Id })
      .columns("Id_Display");
    if (!pedido.length) throw new Error("Pedido no encontrado");
    const pedDisplay = pedido[0].Id_Display;

    // 2. Siguiente NumLinea correlativa
    const maxResult = await tx.run(
      SELECT`max(NumLinea) as maxNum`.from("Linea").where({ Pedido_Id }),
    );
    const maxLinea = maxResult[0]?.maxNum || 0;
    const num = maxLinea + 1;

    // 3. ID_Display: PEDIDO-ID-L01
    req.data.NumLinea = num;
    req.data.Id_Display = `${pedDisplay}-L${num.toString().padStart(2, "0")}`;
    // 4. Inicializar Kilos_Restantes igual a Kilos
    if (req.data.Kilos) {
      req.data.Kilos_Restantes = req.data.Kilos;
    }
  });

  srv.before(["CREATE"], "Entrada", async (req) => {      

    const {
      Producto_Id,
      Variedad_Id,
      Calibre_Id,
      Fecha_recogida,
      Kilos,
    } = req.data;

    
    if (typeof Kilos !== "number" || Kilos <= 0) {
      throw new Error("Kilos debe ser un número mayor que 0 para la entrada");
    }

    if (Fecha_recogida) {
      const fechaRecogida = new Date(Fecha_recogida);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      fechaRecogida.setHours(0, 0, 0, 0);
      if (fechaRecogida > today) {
        throw new Error("La fecha de recogida no puede ser posterior a hoy");
      }
    }

    const tx = cds.tx(req);

    const producto = await tx
      .read("Producto")
      .where({ Id: Producto_Id })
      .columns("Nombre");
    if (!producto.length || !producto[0].Nombre)
      throw new Error("Producto no encontrado");

    const variedad = await tx
      .read("Variedad")
      .where({ Id: Variedad_Id })
      .columns("Nombre", "Producto_Id");
    if (!variedad.length || !variedad[0].Nombre)
      throw new Error("Variedad no encontrada");

    if (variedad[0].Producto_Id !== Producto_Id) {
      throw new Error("La variedad seleccionada no pertenece al producto indicado");
    }

    await validateEntradaDependencies(tx, Producto_Id, Variedad_Id, Calibre_Id);

    const productName = producto[0].Nombre.replace(/\s+/g, "_")
      .toUpperCase()
      .slice(0, 3);
    const varietyName = variedad[0].Nombre.replace(/\s+/g, "_")
      .toUpperCase()
      .slice(0, 3);
    const recoDate = new Date(Fecha_recogida)
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");
    const nowDate = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    req.data.Id_Display = `${productName}-${varietyName}-${recoDate}-${nowDate}`;
    req.data.Kilos_disponibles = Kilos;
  });

  srv.before(["UPDATE"], "Entrada", async (req) => {  
    const { Kilos, Producto_Id, Variedad_Id, Calibre_Id, Fecha_recogida } = req.data;
    
    if (Kilos !== undefined && (typeof Kilos !== "number" || Kilos <= 0)) {
      throw new Error("Kilos debe ser un número mayor que 0 para la entrada");
    }

    if (Fecha_recogida) {
      const fechaRecogida = new Date(Fecha_recogida);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      fechaRecogida.setHours(0, 0, 0, 0);
      if (fechaRecogida > today) {
        throw new Error("La fecha de recogida no puede ser posterior a hoy");
      }
    }

    if (Producto_Id === undefined && Variedad_Id === undefined && Calibre_Id === undefined) {
      return;
    }

    const tx = cds.tx(req);

    const currentEntrada = await tx.run(
      SELECT.one.from("Entrada")
        .where({ Id: req.data.Id })
        .columns("Id", "Producto_Id", "Variedad_Id", "Calibre_Id"),
    );

    if (!currentEntrada) {
      throw new Error("Entrada no encontrada");
    }

    if (Producto_Id !== undefined && Producto_Id !== currentEntrada.Producto_Id) {
      if (Variedad_Id === undefined) req.data.Variedad_Id = null;
      if (Calibre_Id === undefined) req.data.Calibre_Id = null;
    }

    const effectiveProductoId = req.data.Producto_Id !== undefined
      ? req.data.Producto_Id
      : currentEntrada.Producto_Id;
    const effectiveVariedadId = req.data.Variedad_Id !== undefined
      ? req.data.Variedad_Id
      : currentEntrada.Variedad_Id;
    const effectiveCalibreId = req.data.Calibre_Id !== undefined
      ? req.data.Calibre_Id
      : currentEntrada.Calibre_Id;

    await validateEntradaDependencies(
      tx,
      effectiveProductoId,
      effectiveVariedadId,
      effectiveCalibreId,
    );
  });

  /**
   * codigo a ejecutar antes (BEFORE) de crear un registro en Trazabilidad
   */
  srv.before("CREATE", "Trazabilidad", async (req) => {
    /*Extraigo de req.data que contiene los datos que el cliente está intentando crear, el ID y los kilos*/
    var Entrada_Id = req.data.Entrada_Id;
    var Kilos_Usados = req.data.Kilos_Usados;
    var Linea_Id = req.data.Linea_Id;

    var Kilos_Merma = Number(req.data.Kilos_Merma || 0);

    const kilosTotales = Kilos_Usados + Kilos_Merma;

    /*Detengo la ejecucion si no existen los datos*/
    if (!Entrada_Id || !Kilos_Usados) return;

    /*Creo una variable que almacene la transaccion ligada al request
            Todo lo que se ejecute con tx.run():
                Se confirma (commit) si todo sale bien
                Se revierte (rollback) si ocurre un error */
    const tx = cds.tx(req);

    const entrada = await tx.run(
      SELECT.one.from("Entrada").where({ Id: Entrada_Id })
      /* SELECT.from(Entrada, Entrada_Id), */
    );

    const linea = await tx.run(
      SELECT.one.from("Linea").where({ Id: Linea_Id }),
    );

    /* validacion de la entrada */
    /*Validar que la Entrada exista*/
    if (!entrada) {
      req.error(404, "Entrada no encontrada");
      return;
    }
    /*Validar kilos disponibles de la entrada*/
    if (entrada.Kilos_disponibles < Kilos_Usados) {
      req.error(400, "No hay kilos disponibles suficientes");
      return;
    }
    if (entrada.Kilos_disponibles < kilosTotales) {
      req.error(400, "Kilos usados + merma superan los disponibles");
      return;
    }

    /* validacion de la linea */
    /*Validar que la linea exista*/
    if (!linea) {
      req.error(404, "Línea no encontrada");
      return;
    }

    /* Validar que no se superen los kilos restantes de la línea */
    if (linea.Kilos_Restantes < Kilos_Usados) {
      req.error(
        400,
        `Se superan los kilos de la línea. Kilos restantes disponibles: ${linea.Kilos_Restantes}`,
      );
      return;
    }

    /*Actualizar kilos disponibles en la Entrada, dentro de la misma transacción (tx)
        garantizando que si falla la creación de Trazabilidad, no se descuentan los kilos*/
    await tx.run(
      UPDATE("Entrada")
        .set({
          Kilos_disponibles: entrada.Kilos_disponibles - kilosTotales,
          Kilos_Merma: (entrada.Kilos_Merma || 0) + Kilos_Merma,
          Estado_code: (entrada.Kilos_disponibles - kilosTotales) <= 0 ? "V" : "D",
        })
        .where({ Id: Entrada_Id }),
    );

    /* Actualizar Kilos_Restantes de la Línea */
    await tx.run(
      UPDATE("Linea")
        .set({
          Kilos_Restantes: linea.Kilos_Restantes - Kilos_Usados,
        })
        .where({ Id: Linea_Id }),
    );
  });

  srv.before("DELETE", "Trazabilidad", async (req) => {
    const tx = cds.tx(req);
    const trazabilidad = await tx.run(
      SELECT.one.from("Trazabilidad").where({ Id: req.data.Id }),
    );

    if (!req.data?.Id) {
      req.error(400, "Se requiere Id para eliminar la trazabilidad");
      return;
    }

    if (!trazabilidad) {
      req.error(404, "Trazabilidad no encontrada");
      return;
    }

    const entrada = await tx.run(
      SELECT.one.from("Entrada").where({ Id: trazabilidad.Entrada_Id }),
    );

    if (!entrada) {
      req.error(404, "Entrada asociada no encontrada");
      return;
    }

    const linea = await tx.run(
      SELECT.one.from("Linea").where({ Id: trazabilidad.Linea_Id }),
    );

    if (!linea) {
      req.error(404, "Línea asociada no encontrada");
      return;
    }

    const kilosUsados = Number(trazabilidad.Kilos_Usados || 0);
    const kilosMerma = Number(trazabilidad.Kilos_Merma || 0);
    const kilosTotales = kilosUsados + kilosMerma;

    await tx.run(
      UPDATE("Entrada")
        .set({
          Kilos_disponibles: Number(entrada.Kilos_disponibles || 0) + kilosTotales,
          Kilos_Merma: Math.max(Number(entrada.Kilos_Merma || 0) - kilosMerma, 0),
          Estado_code: (Number(entrada.Kilos_disponibles || 0) + kilosTotales) <= 0 ? "V" : "D",
        })
        .where({ Id: trazabilidad.Entrada_Id }),
    );

    await tx.run(
      UPDATE("Linea")
        .set({
          Kilos_Restantes: Number(linea.Kilos_Restantes || 0) + kilosUsados,
        })
        .where({ Id: trazabilidad.Linea_Id }),
    );
  });

  srv.before("DELETE", "Linea", async (req) => {
    if (!req.data?.Id) {
      req.error(400, "Se requiere Id para eliminar la línea");
      return;
    }

    const tx = cds.tx(req);
    const linea = await tx.run(
      SELECT.one.from("Linea").where({ Id: req.data.Id }).columns("Id"),
    );

    if (!linea) {
      req.error(404, "Línea no encontrada");
      return;
    }

    await cleanupTrazabilidadForLineas(tx, [linea.Id]);
  });

  srv.before("DELETE", "Pedido", async (req) => {
    if (!req.data?.Id) {
      req.error(400, "Se requiere Id para eliminar el pedido");
      return;
    }

    const tx = cds.tx(req);
    const pedido = await tx.run(
      SELECT.one.from("Pedido").where({ Id: req.data.Id }).columns("Id"),
    );

    if (!pedido) {
      req.error(404, "Pedido no encontrado");
      return;
    }

    const lineas = await tx.run(
      SELECT.from("Linea").columns("Id").where({ Pedido_Id: pedido.Id }),
    );

    const lineaIds = lineas.map((linea) => linea.Id);
    await cleanupTrazabilidadForLineas(tx, lineaIds);
  });

  /**finalizar pedido */
  srv.before("UPDATE", "Pedido", async (req) => {
    // Verifico que exista el campo Estado del pedido
    const nuevoEstado = req.data.Estado_code;
    if (!nuevoEstado) return;

    // Declaro una variable para almacenar la transaccion
    const tx = cds.tx(req);

    // Selecciono el pedido de la consulta
    const pedido = await tx.run(
      SELECT.one.from("Pedido").where({ Id: req.data.Id }),
    );

    // Selecciono las líneas del pedido
    const lineas = await tx.run(
      SELECT.from("Linea").where({ Pedido_Id: pedido.Id }),
    );

    // Hago las comprobaciones
    if (!pedido) {
      req.error(404, "Pedido no encontrado");
      return;
    }

    if (!lineas.length) {
      req.error(400, "El pedido no tiene líneas");
      return;
    }

    // Valido que las lineas tengan los campos obligatorios, y kilos con un valor positivo
    for (const linea of lineas) {
      if (
        !linea.Producto_Id ||
        !linea.Variedad_Id ||
        !linea.Caja_Id ||
        !linea.Calibre_Id ||
        !linea.Kilos ||
        linea.Kilos <= 0
      ) {
        req.error(400, "Existen líneas con campos obligatorios vacíos");
        return;
      }
    }

    // Compruebo que el pedido no este finalizado ya
    if (pedido.Estado_code === "F") {
      req.error(400, "El pedido ya está finalizado");
      return;
    }

    if (nuevoEstado === "F") {
      // Valido que al pedido se le hayan asignado entradas antes de cambiar su estado de Creado a Procesando
      let trazabilidad = await tx.run(
        SELECT.from("Trazabilidad").where({ "Linea.Pedido_Id": pedido.Id }),
      );

      if (!trazabilidad.length) {
        req.error(400, "El pedido no tiene asignada entradas");
        return;
      }

      const lineas = await tx.run(
        SELECT.from("Linea").where({ Pedido_Id: pedido.Id }),
      );

      for (const linea of lineas) {
        const result = await tx.run(
          SELECT.one.from("Trazabilidad")
            .columns`sum(Kilos_Usados) as total`.where({ Linea_Id: linea.Id }),
        );

        // Devuelve los kilos asignados, si no existen asumo que son 0 kilos
        const kilosAsignados = result?.total || 0;

        if (kilosAsignados !== linea.Kilos) {
          req.error(400, "No se puede finalizar el pedido, faltan kilos por asignar.");
          return;
        }
      }
    }
  });

 /*  srv.before("CREATE", "Producto", async (req) => {
    const {
      Nombre     
    } = req.data;

    if (!Nombre)
      throw new Error("Nombre es obligatorio para crear producto");
    
  }); */


};
