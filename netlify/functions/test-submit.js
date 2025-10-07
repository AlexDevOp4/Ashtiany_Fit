exports.handler = async (event) => {
  console.log("Test triggered manually");
  return { statusCode: 200, body: "OK" };
};
