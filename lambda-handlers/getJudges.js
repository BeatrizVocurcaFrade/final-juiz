// lambda-handlers/getJudges.js
exports.handler = async (event) => {
    const judges = [
      {
        "_id": "149c3984-5e0f-53a7-832c-1175e6389007",
        "name": "Katia",
        "image_url": null,
        "country": null,
        "average_yellow_cards": 3.15,
        "average_red_cards": 0.081,
        "average_fouls": 22,
        "num_var_inc_idents": 3
      }, {
        "_id": "249c3984-5e0f-53a7-832c-1175e6389007",
        "name": "Beatriz Frade",
        "image_url": null,
        "country": null,
        "average_yellow_cards": 3.25,
        "average_red_cards": 0.082,
        "average_fouls": 22,
        "num_var_inc_idents": 3
      }, {
        "_id": "349c3984-5e0f-53a7-832c-1175e6389007",
        "name": "João Itzel Garcia Mendoza",
        "image_url": null,
        "country": null,
        "average_yellow_cards": 3.35,
        "average_red_cards": 0.083,
        "average_fouls": 22,
        "num_var_inc_idents": 3
      }
    ];
  
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // Habilita CORS para todos os origens
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,OPTIONS"
      },
      body: JSON.stringify(judges),
    };
  };