import * as helpers from "./helpers";
const constants = require("./constants");
const OrganizationRegister = artifacts.require("./OrganizationRegister.sol");
const StandardTokenMock = artifacts.require("./test/StandardTokenMock.sol");
const Avatar = artifacts.require("./Avatar.sol");
const DAOToken = artifacts.require("./DAOToken.sol");
const ActorsFactory = artifacts.require("./ActorsFactory.sol");
const DAOFactory = artifacts.require("./DAOFactory.sol");
const Controller = artifacts.require("./Controller.sol");
const ControllerFactory = artifacts.require("./ControllerFactory.sol");

export class OrganizationRegisterParams {
  constructor() {}
}

const setupOrganizationRegisterParams = async function(
  organizationRegister,
  tokenAddress,
  beneficiary
) {
  var organizationRegisterParams = new OrganizationRegisterParams();
  organizationRegisterParams.votingMachine = await helpers.setupAbsoluteVote();
  await organizationRegister.setParameters(tokenAddress, 13, beneficiary);
  organizationRegisterParams.paramsHash = await organizationRegister.getParametersHash(
    tokenAddress,
    13,
    beneficiary
  );
  return organizationRegisterParams;
};

const setup = async function(accounts) {
  var testSetup = new helpers.TestSetup();
  testSetup.fee = 10;
  testSetup.standardTokenMock = await StandardTokenMock.new(accounts[1], 100);
  testSetup.organizationRegister = await OrganizationRegister.new();

  var controller = await Controller.new({
    gas: constants.ARC_GAS_LIMIT
  });

  var controllerFactory = await ControllerFactory.new(controller.address, {
    gas: constants.ARC_GAS_LIMIT
  });

  var avatarLibrary = await Avatar.new({ gas: constants.ARC_GAS_LIMIT });
  var daoTokenLibrary = await DAOToken.new({ gas: constants.ARC_GAS_LIMIT });

  var actorsFactory = await ActorsFactory.new(
    avatarLibrary.address,
    daoTokenLibrary.address,
    { gas: constants.ARC_GAS_LIMIT }
  );

  testSetup.daoFactory = await DAOFactory.new(
    controllerFactory.address,
    actorsFactory.address,
    {
      gas: constants.ARC_GAS_LIMIT
    }
  );

  testSetup.org = await helpers.setupOrganization(
    testSetup.daoFactory,
    accounts[0],
    1000,
    1000
  );
  testSetup.organizationRegisterParams = await setupOrganizationRegisterParams(
    testSetup.organizationRegister,
    testSetup.standardTokenMock.address,
    accounts[2]
  );
  var permissions = "0x00000000";
  await testSetup.daoFactory.setSchemes(
    testSetup.org.avatar.address,
    [testSetup.organizationRegister.address],
    [testSetup.organizationRegisterParams.paramsHash],
    [permissions]
  );

  return testSetup;
};

contract("OrganizationRegister", accounts => {
  before(function() {
    helpers.etherForEveryone(accounts);
  });

  it("setParameters", async () => {
    var organizationRegister = await OrganizationRegister.new();
    await organizationRegister.setParameters(accounts[3], 13, accounts[2]);
    var paramHash = await organizationRegister.getParametersHash(
      accounts[3],
      13,
      accounts[2]
    );
    var parameters = await organizationRegister.parameters(paramHash);
    assert.equal(parameters[1], accounts[3]);
    assert.equal(parameters[0], 13);
    assert.equal(parameters[2], accounts[2]);
  });

  it("addOrPromoteAddress add and promote ", async function() {
    var testSetup = await setup(accounts);
    var record = accounts[4];
    var amount = 13;

    await testSetup.standardTokenMock.approve(
      testSetup.organizationRegister.address,
      100,
      { from: accounts[1] }
    );

    var tx = await testSetup.organizationRegister.addOrPromoteAddress(
      testSetup.org.avatar.address,
      record,
      amount,
      { from: accounts[1] }
    );
    assert.equal(tx.logs.length, 2);
    assert.equal(tx.logs[0].event, "OrgAdded");
    assert.equal(tx.logs[1].event, "Promotion");
    var registery = await helpers.getValueFromLogs(tx, "_registry");
    var org = await helpers.getValueFromLogs(tx, "_org");
    var registeryAmount = await testSetup.organizationRegister.organizationsRegistry(
      registery,
      org
    );
    assert.equal(amount, registeryAmount);
    //now try to promote.
    tx = await testSetup.organizationRegister.addOrPromoteAddress(
      testSetup.org.avatar.address,
      record,
      1,
      { from: accounts[1] }
    );
    assert.equal(tx.logs.length, 1);
    assert.equal(tx.logs[0].event, "Promotion");
    registery = await helpers.getValueFromLogs(tx, "_registry");
    org = await helpers.getValueFromLogs(tx, "_org");
    registeryAmount = await testSetup.organizationRegister.organizationsRegistry(
      registery,
      org
    );
    assert.equal(amount + 1, registeryAmount);
  });

  it("addOrPromoteAddress add without enough fee should fail ", async function() {
    var testSetup = await setup(accounts);
    var record = accounts[4];
    var amount = 12;

    await testSetup.standardTokenMock.approve(
      testSetup.organizationRegister.address,
      100,
      { from: accounts[1] }
    );

    try {
      await testSetup.organizationRegister.addOrPromoteAddress(
        testSetup.org.avatar.address,
        record,
        amount,
        { from: accounts[1] }
      );
      assert(false, "addOrPromoteAddress should  fail - due to amount<fee !");
    } catch (ex) {
      helpers.assertVMException(ex);
    }
  });
});
