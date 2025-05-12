const { MongoClient } = require("mongodb");

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME;
const username = process.env.MONGO_USER;
const password = process.env.MONGO_PASSWORD;

// lambda/consumeFila.js
const { SQSClient, DeleteMessageCommand } = require("@aws-sdk/client-sqs");
const sqsClient = new SQSClient({});

// A URL da fila será passada como variável de ambiente, mas a SQS Lambda integration
// já fornece o receiptHandle que é o mais importante para a deleção.
// O QueueUrl é necessário se você fosse fazer outras operações além de deletar a mensagem
// recebida no evento. Para DeleteMessageCommand, precisamos dele.
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL; // Vamos passar isso para ter certeza

exports.handler = async (event) => {
  console.log(`consumeFila Lambda invoked. Received ${event.Records.length} messages.`);
  console.log("SQS_QUEUE_URL for deletion:", SQS_QUEUE_URL);

  if (!SQS_QUEUE_URL) {
    console.error("Configuration error: SQS_QUEUE_URL not set. Cannot delete messages.");
    // Se não pudermos deletar, não devemos processar para evitar loops infinitos de mensagens
    // A configuração do evento SQS deve fornecer o QueueArn, mas para a deleção explícita,
    // precisamos da URL da fila.
    // Alternativamente, a SQS Lambda integration pode ser configurada para não exigir deleção manual
    // se o Lambda retornar sucesso, mas a deleção explícita é mais controlada.
    // No entanto, com reportBatchItemFailures, precisamos retornar quais itens falharam.
    // Se a configuração da fila estiver faltando, todo o lote falha.
    throw new Error("SQS_QUEUE_URL environment variable not set.");
  }

  const batchItemFailures = [];

  for (const record of event.Records) {
    try {
      console.log("Processing message ID:", record.messageId);
      console.log("Message Body:", record.body);

      // Parse o corpo da mensagem (que é o objeto 'judge' como string JSON)
      const judgeData = JSON.parse(record.body);

      
      const client = new MongoClient(uri, {
        auth: { username, password },
        tls: true,
        tlsAllowInvalidCertificates: true, // necessário para DocumentDB
      });      

      try {
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection("judges");

        await collection.insertOne(judgeData);
        console.log("Successfully inserted judge into MongoDB.");
      } catch (err) {
        console.error("MongoDB insert error:", err);
      } finally {
        await client.close();
      }


      // Logar os dados do juiz (aqui você poderia fazer um processamento mais complexo)
      console.log("Logging Judge Data:", JSON.stringify(judgeData, null, 2));

      // Se o log (ou qualquer processamento) for bem-sucedido, delete a mensagem da fila
      console.log(`Attempting to delete message ${record.messageId} with receipt handle ${record.receiptHandle}`);
      const deleteParams = {
        QueueUrl: SQS_QUEUE_URL, // A URL da fila de onde a mensagem veio
        ReceiptHandle: record.receiptHandle,
      };
      await sqsClient.send(new DeleteMessageCommand(deleteParams));
      console.log(`Successfully deleted message ${record.messageId}`);

    } catch (error) {
      console.error(`Error processing message ID ${record.messageId}:`, error);
      // Adicionar à lista de falhas para que o SQS saiba que este item específico não foi processado
      batchItemFailures.push({
        itemIdentifier: record.messageId,
      });
    }
  }

  // Retornar os identificadores dos itens que falharam
  // Se o array estiver vazio, significa que todos os itens do lote foram processados com sucesso.
  console.log("Batch item failures:", batchItemFailures);
  return { batchItemFailures };
};