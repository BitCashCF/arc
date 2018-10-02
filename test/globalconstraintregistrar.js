import * as helpers from "./helpers";
const constants = require("./constants");
const GlobalConstraintRegistrar = artifacts.require(
  "./GlobalConstraintRegistrar.sol"
);
const GlobalConstraintMock = artifacts.require(
  "./test/GlobalConstraintMock.sol"
);
const Avatar = artifacts.require("./Avatar.sol");
const DAOToken = artifacts.require("./DAOToken.sol");
const ActorsFactory = artifacts.require("./ActorsFactory.sol");
const DAOFactory = artifacts.require("./DAOFactory.sol");
const Controller = artifacts.require("./Controller.sol");
const StandardTokenMock = artifacts.require("./test/StandardTokenMock.sol");
const ControllerFactory = artifacts.require("./ControllerFactory.sol");

export class GlobalConstraintRegistrarParams {
  constructor() {}
}

const setupGlobalConstraintRegistrarParams = async function(
  globalConstraintRegistrar,
  accounts,
  genesisProtocol,
  token
) {
  var globalConstraintRegistrarParams = new GlobalConstraintRegistrarParams();
  if (genesisProtocol === true) {
    globalConstraintRegistrarParams.votingMachine = await helpers.setupGenesisProtocol(
      accounts,
      token
    );
    await globalConstraintRegistrar.setParameters(
      globalConstraintRegistrarParams.votingMachine.params,
      globalConstraintRegistrarParams.votingMachine.genesisProtocol.address
    );
    globalConstraintRegistrarParams.paramsHash = await globalConstraintRegistrar.getParametersHash(
      globalConstraintRegistrarParams.votingMachine.params,
      globalConstraintRegistrarParams.votingMachine.genesisProtocol.address
    );
  } else {
    globalConstraintRegistrarParams.votingMachine = await helpers.setupAbsoluteVote();
    await globalConstraintRegistrar.setParameters(
      globalConstraintRegistrarParams.votingMachine.params,
      globalConstraintRegistrarParams.votingMachine.absoluteVote.address
    );
    globalConstraintRegistrarParams.paramsHash = await globalConstraintRegistrar.getParametersHash(
      globalConstraintRegistrarParams.votingMachine.params,
      globalConstraintRegistrarParams.votingMachine.absoluteVote.address
    );
  }
  return globalConstraintRegistrarParams;
};

const setup = async function(
  accounts,
  genesisProtocol = false,
  tokenAddress = 0
) {
  var testSetup = new helpers.TestSetup();
  testSetup.fee = 10;
  testSetup.globalConstraintRegistrar = await GlobalConstraintRegistrar.new();

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

  testSetup.reputationArray = [20, 10, 70];
  testSetup.org = await helpers.setupOrganizationWithArrays(
    testSetup.daoFactory,
    [accounts[0], accounts[1], accounts[2]],
    [1000, 1000, 1000],
    testSetup.reputationArray
  );
  testSetup.globalConstraintRegistrarParams = await setupGlobalConstraintRegistrarParams(
    testSetup.globalConstraintRegistrar,
    accounts,
    genesisProtocol,
    tokenAddress
  );
  var permissions = "0x00000004";
  //await testSetup.daoFactory.setSchemes(testSetup.org.avatar.address,[testSetup.globalConstraintRegistrar.address],[testSetup.globalConstraintRegistrarParams.paramsHash],[permissions]);
  await testSetup.daoFactory.setSchemes(
    testSetup.org.avatar.address,
    [testSetup.globalConstraintRegistrar.address],
    [testSetup.globalConstraintRegistrarParams.paramsHash],
    [permissions]
  );

  return testSetup;
};
contract("GlobalConstraintRegistrar", accounts => {
  it("setParameters", async () => {
    var globalConstraintRegistrar = await GlobalConstraintRegistrar.new();
    var params = await setupGlobalConstraintRegistrarParams(
      globalConstraintRegistrar
    );
    var parameters = await globalConstraintRegistrar.parameters(
      params.paramsHash
    );
    assert.equal(parameters[1], params.votingMachine.absoluteVote.address);
  });

  it("proposeGlobalConstraint voteToRemoveParams", async function() {
    var testSetup = await setup(accounts);
    var globalConstraintMock = await GlobalConstraintMock.new();

    var tx = await testSetup.globalConstraintRegistrar.proposeGlobalConstraint(
      testSetup.org.avatar.address,
      globalConstraintMock.address,
      "0x1234",
      "0x1235"
    );
    var proposalId = await helpers.getValueFromLogs(tx, "_proposalId", 1);
    await testSetup.globalConstraintRegistrarParams.votingMachine.absoluteVote.vote(
      proposalId,
      1,
      0,
      { from: accounts[2] }
    );
    var voteToRemoveParams = await testSetup.globalConstraintRegistrar.voteToRemoveParams(
      testSetup.org.avatar.address,
      globalConstraintMock.address
    );
    assert.equal(
      voteToRemoveParams,
      "0x1235000000000000000000000000000000000000000000000000000000000000"
    );
  });

  it("proposeGlobalConstraint organizationsProposals", async function() {
    var testSetup = await setup(accounts);
    var globalConstraintMock = await GlobalConstraintMock.new();

    var tx = await testSetup.globalConstraintRegistrar.proposeGlobalConstraint(
      testSetup.org.avatar.address,
      globalConstraintMock.address,
      "0x1234",
      "0x1234"
    );
    var proposalId = await helpers.getValueFromLogs(tx, "_proposalId", 1);
    var organizationProposal = await testSetup.globalConstraintRegistrar.organizationsProposals(
      testSetup.org.avatar.address,
      proposalId
    );
    assert.equal(organizationProposal[0], globalConstraintMock.address);
  });

  it("proposeGlobalConstraint log", async function() {
    var testSetup = await setup(accounts);
    var globalConstraintMock = await GlobalConstraintMock.new();

    var tx = await testSetup.globalConstraintRegistrar.proposeGlobalConstraint(
      testSetup.org.avatar.address,
      globalConstraintMock.address,
      "0x1234",
      "0x1234"
    );
    assert.equal(tx.logs.length, 1);
    assert.equal(tx.logs[0].event, "NewGlobalConstraintsProposal");
  });

  it("proposeGlobalConstraint check owner vote", async function() {
    var testSetup = await setup(accounts);
    var globalConstraintMock = await GlobalConstraintMock.new();

    var tx = await testSetup.globalConstraintRegistrar.proposeGlobalConstraint(
      testSetup.org.avatar.address,
      globalConstraintMock.address,
      "0x1234",
      "0x1234"
    );
    var proposalId = await helpers.getValueFromLogs(tx, "_proposalId", 1);
    await helpers.checkVoteInfo(
      testSetup.globalConstraintRegistrarParams.votingMachine.absoluteVote,
      proposalId,
      accounts[0],
      [1, testSetup.reputationArray[0]]
    );
  });

  it("execute proposeGlobalConstraint ", async function() {
    var testSetup = await setup(accounts);
    var controller = await Controller.at(await testSetup.org.avatar.owner());
    var globalConstraintMock = await GlobalConstraintMock.new();
    await globalConstraintMock.setConstraint(
      web3.utils.asciiToHex("method"),
      false,
      false
    );

    var tx = await testSetup.globalConstraintRegistrar.proposeGlobalConstraint(
      testSetup.org.avatar.address,
      globalConstraintMock.address,
      "0x1234",
      testSetup.globalConstraintRegistrarParams.votingMachine.params
    );
    assert.equal(tx.logs.length, 1);
    assert.equal(tx.logs[0].event, "NewGlobalConstraintsProposal");
    var proposalId = await helpers.getValueFromLogs(tx, "_proposalId", 1);
    let gcCount = await controller.globalConstraintsCount(
      testSetup.org.avatar.address
    );
    assert.equal(gcCount[0], 0);
    assert.equal(gcCount[1], 0);
    tx = await testSetup.globalConstraintRegistrarParams.votingMachine.absoluteVote.vote(
      proposalId,
      1,
      0,
      { from: accounts[2] }
    );
    gcCount = await controller.globalConstraintsCount(
      testSetup.org.avatar.address
    );
    assert.equal(gcCount[0], 1);
  });

  it("proposeToRemoveGC log", async function() {
    var testSetup = await setup(accounts);
    var globalConstraintMock = await GlobalConstraintMock.new();
    await globalConstraintMock.setConstraint(
      web3.utils.asciiToHex("method"),
      false,
      false
    );

    var tx = await testSetup.globalConstraintRegistrar.proposeGlobalConstraint(
      testSetup.org.avatar.address,
      globalConstraintMock.address,
      "0x1234",
      testSetup.globalConstraintRegistrarParams.votingMachine.params
    );
    var proposalId = await helpers.getValueFromLogs(tx, "_proposalId", 1);
    await testSetup.globalConstraintRegistrarParams.votingMachine.absoluteVote.vote(
      proposalId,
      1,
      0,
      { from: accounts[2] }
    );
    tx = await testSetup.globalConstraintRegistrar.proposeToRemoveGC(
      testSetup.org.avatar.address,
      globalConstraintMock.address
    );
    assert.equal(tx.logs.length, 1);
    assert.equal(tx.logs[0].event, "RemoveGlobalConstraintsProposal");
  });

  it("proposeToRemoveGC without registration -should fail", async function() {
    var testSetup = await setup(accounts, false);
    var globalConstraintMock = await GlobalConstraintMock.new();
    try {
      await testSetup.globalConstraintRegistrar.proposeToRemoveGC(
        testSetup.org.avatar.address,
        globalConstraintMock.address
      );
      assert(
        false,
        "proposeGlobalConstraint should  fail - due to no registration !"
      );
    } catch (ex) {
      helpers.assertVMException(ex);
    }
  });

  it("proposeToRemoveGC check owner vote", async function() {
    var testSetup = await setup(accounts);
    var globalConstraintMock = await GlobalConstraintMock.new();
    await globalConstraintMock.setConstraint(
      web3.utils.asciiToHex("method"),
      false,
      false
    );

    var tx = await testSetup.globalConstraintRegistrar.proposeGlobalConstraint(
      testSetup.org.avatar.address,
      globalConstraintMock.address,
      "0x1234",
      testSetup.globalConstraintRegistrarParams.votingMachine.params
    );
    var proposalId = await helpers.getValueFromLogs(tx, "_proposalId", 1);
    await testSetup.globalConstraintRegistrarParams.votingMachine.absoluteVote.vote(
      proposalId,
      1,
      0,
      { from: accounts[2] }
    );
    await testSetup.globalConstraintRegistrar.proposeToRemoveGC(
      testSetup.org.avatar.address,
      globalConstraintMock.address
    );
    proposalId = await helpers.getValueFromLogs(tx, "_proposalId", 1);
    await helpers.checkVoteInfo(
      testSetup.globalConstraintRegistrarParams.votingMachine.absoluteVote,
      proposalId,
      accounts[0],
      [1, testSetup.reputationArray[0]]
    );
  });

  it("execute proposeToRemoveGC ", async function() {
    var testSetup = await setup(accounts);
    var controller = await Controller.at(await testSetup.org.avatar.owner());
    var globalConstraintMock = await GlobalConstraintMock.new();
    await globalConstraintMock.setConstraint(
      web3.utils.asciiToHex("method"),
      false,
      false
    );

    var tx = await testSetup.globalConstraintRegistrar.proposeGlobalConstraint(
      testSetup.org.avatar.address,
      globalConstraintMock.address,
      "0x1234",
      testSetup.globalConstraintRegistrarParams.votingMachine.params
    );
    var proposalId = await helpers.getValueFromLogs(tx, "_proposalId", 1);
    await testSetup.globalConstraintRegistrarParams.votingMachine.absoluteVote.vote(
      proposalId,
      1,
      0,
      { from: accounts[2] }
    );
    assert.equal(
      await controller.isGlobalConstraintRegistered(
        globalConstraintMock.address,
        testSetup.org.avatar.address
      ),
      true
    );
    tx = await testSetup.globalConstraintRegistrar.proposeToRemoveGC(
      testSetup.org.avatar.address,
      globalConstraintMock.address
    );
    assert.equal(tx.logs.length, 1);
    assert.equal(tx.logs[0].event, "RemoveGlobalConstraintsProposal");
    proposalId = await helpers.getValueFromLogs(tx, "_proposalId", 1);
    let count = await controller.globalConstraintsCount(
      testSetup.org.avatar.address
    );
    assert.equal(count[0], 1);
    await testSetup.globalConstraintRegistrarParams.votingMachine.absoluteVote.vote(
      proposalId,
      1,
      0,
      { from: accounts[2] }
    );
    count = await controller.globalConstraintsCount(
      testSetup.org.avatar.address
    );
    assert.equal(count[0], 0);
  });

  it("execute proposeToRemoveGC (same as proposeGlobalConstraint) vote=NO ", async function() {
    var testSetup = await setup(accounts);
    var controller = await Controller.at(await testSetup.org.avatar.owner());
    var globalConstraintMock = await GlobalConstraintMock.new();
    await globalConstraintMock.setConstraint(
      web3.utils.asciiToHex("method"),
      false,
      false
    );

    var tx = await testSetup.globalConstraintRegistrar.proposeGlobalConstraint(
      testSetup.org.avatar.address,
      globalConstraintMock.address,
      "0x1234",
      testSetup.globalConstraintRegistrarParams.votingMachine.params
    );
    var proposalId = await helpers.getValueFromLogs(tx, "_proposalId", 1);
    await testSetup.globalConstraintRegistrarParams.votingMachine.absoluteVote.vote(
      proposalId,
      0,
      0,
      { from: accounts[2] }
    );
    let count = await controller.globalConstraintsCount(
      testSetup.org.avatar.address
    );
    assert.equal(count[0], 0);
  });

  it("proposeToRemoveGC  with genesis protocol", async function() {
    var standardTokenMock = await StandardTokenMock.new(accounts[0], 1000);
    var testSetup = await setup(accounts, true, standardTokenMock.address);
    var globalConstraintMock = await GlobalConstraintMock.new();
    //genesisProtocol use burn reputation.
    await globalConstraintMock.setConstraint(
      web3.utils.asciiToHex("burnReputation"),
      true,
      true
    );

    var tx = await testSetup.globalConstraintRegistrar.proposeGlobalConstraint(
      testSetup.org.avatar.address,
      globalConstraintMock.address,
      "0x1234",
      testSetup.globalConstraintRegistrarParams.votingMachine.params
    );

    var proposalId = await helpers.getValueFromLogs(tx, "_proposalId", 1);
    await testSetup.globalConstraintRegistrarParams.votingMachine.genesisProtocol.vote(
      proposalId,
      1,
      0,
      { from: accounts[2] }
    );

    tx = await testSetup.globalConstraintRegistrar.proposeToRemoveGC(
      testSetup.org.avatar.address,
      globalConstraintMock.address
    );
    proposalId = await helpers.getValueFromLogs(tx, "_proposalId", 1);
    var rep = await testSetup.org.reputation.balanceOf(accounts[2]);

    await testSetup.globalConstraintRegistrarParams.votingMachine.genesisProtocol.vote(
      proposalId,
      1,
      0,
      { from: accounts[2] }
    );
    await helpers.checkVoteInfo(
      testSetup.globalConstraintRegistrarParams.votingMachine.genesisProtocol,
      proposalId,
      accounts[2],
      [1, rep.toNumber()]
    );
  });
});
