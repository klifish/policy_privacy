const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HelloHardhat", function () {
    it("should return the correct greeting", async function () {
        const HelloWorld = await ethers.getContractFactory("HelloWorld");
        const helloWorld = await HelloWorld.deploy();
        await helloWorld.deployed();

        expect(await helloWorld.greet()).to.equal("Hello, Hardhat!");
    });
});