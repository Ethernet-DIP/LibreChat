/**
 * Public self-registration is closed: accounts are created by an admin (Users & roles, or the
 * `create-user` script). The only way through this route is a valid invite, which
 * `checkInviteUser` has already resolved onto the request.
 */
function validateRegistration(req, res, next) {
  if (req.invite) {
    return next();
  }

  return res.status(403).json({
    message: 'Registration is not allowed.',
  });
}

module.exports = validateRegistration;
