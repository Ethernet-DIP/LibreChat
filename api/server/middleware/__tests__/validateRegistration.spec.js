const validateRegistration = require('../validateRegistration');

const run = (req) => {
  const json = jest.fn();
  const res = { status: jest.fn().mockReturnValue({ json }) };
  const next = jest.fn();
  validateRegistration(req, res, next);
  return { res, json, next };
};

describe('validateRegistration', () => {
  afterEach(() => {
    delete process.env.ALLOW_REGISTRATION;
  });

  it('refuses self-registration even when ALLOW_REGISTRATION is on', () => {
    process.env.ALLOW_REGISTRATION = 'true';
    const { res, next } = run({});
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('lets a valid invite through', () => {
    const { next } = run({ invite: { token: 't' } });
    expect(next).toHaveBeenCalled();
  });
});
