// Express 4 does not catch errors thrown inside "async" functions by itself.
// asyncHandler wraps a route function so any error is passed to errorHandler.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Runs when no route matched the URL
function notFound(req, res) {
  res.status(404).json({
    error: "not_found",
    message: `No route for ${req.method} ${req.originalUrl}`,
  });
}

// The last safety net: any error that was not handled ends up here
function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.code || "server_error",
    message: err.status ? err.message : "Something went wrong on the server.",
  });
}

module.exports = { asyncHandler, notFound, errorHandler };
