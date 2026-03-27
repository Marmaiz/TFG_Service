namespace MGMTFG;

using {
    cuid,
    managed,
    sap.common.CodeList
} from '@sap/cds/common';


/***** Entidades de datos maestros ********/

entity Producto {
    key Id     : UUID;
        Nombre : String(100);
}

entity Calibre {
    key Id               : UUID;
        Nombre           : String(50);
        Peso_Aprox_Pieza : String(20);
        Producto         : Association to Producto;
}

entity Caja {
    key Id     : UUID;
        Nombre : String(50);
        Peso   : Integer;
};

entity Variedad {
    key Id       : UUID;
        Nombre   : String(100);
        Producto : Association to Producto;
}

entity Pedido : managed {
    key Id           : UUID;
        Id_Display   : String(100);
        Cliente      : Association to Cliente;
        Fecha_Pedido : Date;
        Estado       : Association to Estado default 'C';
        Lineas       : Composition of many Linea
                           on Lineas.Pedido = $self;
}

entity Linea : managed {
    key Id              : UUID;
        Id_Display      : String(100);
        NumLinea        : Integer;
        Producto        : Association to Producto;
        Variedad        : Association to Variedad;
        Calibre         : Association to Calibre;
        Caja            : Association to Caja;
        Pedido          : Association to Pedido;
        Kilos           : Integer;
        Kilos_Restantes : Integer;
        toEntradas      : Association to many Trazabilidad
                              on toEntradas.Linea = $self;
/*                                Entrada  : Association to many Entrada
                                              on Entrada.Id; */
/* Entrada : Association to many Entrada; */
}

entity Entrada : managed {
    key Id                : UUID;
        Socio             : Association to Socio;
        Fecha_recogida    : Date;
        Kilos             : Integer not null;
        Kilos_disponibles : Integer; /*para probar*/
        Kilos_Merma       : Integer default 0; /*para probar*/
        Calibre           : Association to Calibre;
        Producto          : Association to Producto;
        Variedad          : Association to Variedad;
        Estado            : Association to Estado default 'D';
        toLineas          : Association to many Trazabilidad
                                on toLineas.Entrada = $self;
}

entity Trazabilidad {
    key Id           : UUID;

        Linea        : Association to Linea; // no se si es asi
        Entrada      : Association to Entrada;

        Kilos_Usados : Integer; // <-- Kilos usados de esa entrada
        Kilos_Merma  : Integer @cds.persistence.skip;
}

entity Estado : CodeList {
    key code : String enum {
            /* Esto para los pedidos*/
    Creado = 'C';
    En_proceso = 'P';
    Finalizado = 'F';

        /* Para las entradas*/
    Vendido = 'V';
    Disponible = 'D';
    };
}

entity Cliente {
    key Id        : UUID;
        Nombre    : String(50);
        CIF       : String(10);
        Direccion : String(100);
        Telefono  : String(10);
}

entity Socio {
    key Id        : UUID;
        Nombre    : String(50);
        CIF       : String(10);
        Direccion : String(100);
        Telefono  : String(10);
}