using { MGMTFG } from '../db/schema';

@path : '/service/MasterDataService'
service MasterDataService
{
    annotate Caja with @restrict :
    [
        { grant : [ '*' ], to : [ 'Admin' ] },
        { grant : [ 'READ' ], to : [ 'Produccion' ] },
        { grant : [ 'READ' ], to : [ 'Comercial' ] }
    ];

    annotate Calibre with @restrict :
    [
        { grant : [ '*' ], to : [ 'Admin' ] },
        { grant : [ 'READ' ], to : [ 'Produccion' ] },
        { grant : [ 'READ' ], to : [ 'Comercial' ] }
    ];

    annotate Cliente with @restrict :
    [
        { grant : [ '*' ], to : [ 'Admin' ] },
        { grant : [ '*' ], to : [ 'Comercial' ] },
        { grant : [ 'READ' ], to : [ 'Produccion' ] }
    ];

    annotate Producto with @restrict :
    [
        { grant : [ '*' ], to : [ 'Admin' ] },
        { grant : [ 'READ' ], to : [ 'Produccion' ] },
        { grant : [ 'READ' ], to : [ 'Comercial' ] }
    ];

    annotate Socio with @restrict :
    [
        { grant : [ '*' ], to : [ 'Admin' ] },
        { grant : [ '*' ], to : [ 'Comercial' ] },
        { grant : [ 'READ' ], to : [ 'Produccion' ] }
    ];

    annotate Variedad with @restrict :
    [
        { grant : [ '*' ], to : [ 'Admin' ] },
        { grant : [ 'READ' ], to : [ 'Produccion' ] },
        { grant : [ 'READ' ], to : [ 'Comercial' ] }
    ];

    @fiori.draft.enabled
    @odata.draft.enabled
    entity Variedad as
        projection on MGMTFG.Variedad;

    @fiori.draft.enabled
    @odata.draft.enabled
    entity Calibre as
        projection on MGMTFG.Calibre;

    @fiori.draft.enabled
    @odata.draft.enabled
    entity Caja as
        projection on MGMTFG.Caja;

    @fiori.draft.enabled
    @odata.draft.enabled
    entity Producto as
        projection on MGMTFG.Producto;

    @fiori.draft.enabled
    @odata.draft.enabled
    entity Socio as
        projection on MGMTFG.Socio;

    @fiori.draft.enabled
    @odata.draft.enabled
    entity Cliente as
        projection on MGMTFG.Cliente;
}

annotate MasterDataService with @requires :
[
    'Admin',
    'Comercial',
    'Produccion'
];


@path : '/service/PedidosService'
service PedidosService
{
    annotate Caja with @restrict :
    [
        { grant : [ '*' ], to : [ 'Admin' ] },
        { grant : [ '*' ], to : [ 'Comercial' ] },
        { grant : [ 'READ' ], to : [ 'Produccion' ] }
    ];

    annotate Calibre with @restrict :
    [
        { grant : [ '*' ], to : [ 'Admin' ] },
        { grant : [ '*' ], to : [ 'Comercial' ] },
        { grant : [ 'READ' ], to : [ 'Produccion' ] }
    ];

    annotate Cliente with @restrict :
    [
        { grant : [ '*' ], to : [ 'Admin' ] },
        { grant : [ '*' ], to : [ 'Comercial' ] },
        { grant : [ 'READ' ], to : [ 'Produccion' ] }
    ];

    annotate Entrada with @restrict :
    [
        { grant : [ '*' ], to : [ 'Admin' ] },
        { grant : [ '*' ], to : [ 'Comercial' ] },
        { grant : [ 'READ' ], to : [ 'Produccion' ] }
    ];

    annotate Producto with @restrict :
    [
        { grant : [ '*' ], to : [ 'Admin' ] },
        { grant : [ 'READ' ], to : [ 'Comercial' ] },
        { grant : [ 'READ' ], to : [ 'Produccion' ] }
    ];

    annotate Socio with @restrict :
    [
        { grant : [ '*' ], to : [ 'Admin' ] },
        { grant : [ '*' ], to : [ 'Comercial' ] },
        { grant : [ 'READ' ], to : [ 'Produccion' ] }
    ];

    annotate Trazabilidad with @restrict :
    [
        { grant : [ '*' ], to : [ 'Admin' ] },
        { grant : [ '*' ], to : [ 'Comercial' ] },
        { grant : [ '*' ], to : [ 'Produccion' ] }
    ];

    annotate Variedad with @restrict :
    [
        { grant : [ '*' ], to : [ 'Admin' ] },
        { grant : [ 'READ' ], to : [ 'Comercial' ] },
        { grant : [ 'READ' ], to : [ 'Produccion' ] }
    ];

    entity Pedido as
        projection on MGMTFG.Pedido;

    @fiori.draft.enabled
    @odata.draft.enabled
    entity Entrada as
        projection on MGMTFG.Entrada;

    entity Linea as
        projection on MGMTFG.Linea;

    entity Trazabilidad as
        projection on MGMTFG.Trazabilidad;

    entity Cliente as
        projection on MGMTFG.Cliente;

    entity Socio as
        projection on MGMTFG.Socio;

    entity Calibre as
        projection on MGMTFG.Calibre;

    entity Caja as
        projection on MGMTFG.Caja;

    entity Producto as
        projection on MGMTFG.Producto;

    entity Variedad as
        projection on MGMTFG.Variedad;

}

annotate PedidosService with @requires :
[
    'Comercial',
    'Admin',
    'Produccion'
];
