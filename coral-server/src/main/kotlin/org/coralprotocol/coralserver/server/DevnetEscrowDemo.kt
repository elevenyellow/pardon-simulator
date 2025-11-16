//package org.coralprotocol.coralserver.server
//import org.coralprotocol.coralserver.escrow.blockchain.BlockchainServiceImpl
//import org.coralprotocol.coralserver.escrow.blockchain.models.SignerConfig
//import org.coralprotocol.coralserver.escrow.blockchain.builders.CoralRequestBuilders
//import kotlinx.coroutines.runBlocking
//import kotlinx.coroutines.delay
//import java.io.File
//

// TODO: Use the other demo as a reference
///**
// * Standalone demo using the distributed JAR to run a complete escrow flow on devnet.
// *
// * Prerequisites:
// * 1. The coral-blockchain JAR must be published to local Maven repository
// * 2. You need a funded wallet on devnet (will use testkey/master.json)
// * 3. The program must be deployed and initialized on devnet
// */
//fun main() = runBlocking {
//    println("=" * 60)
//    println("=" * 60)
//    println()
//
//    // Configuration
//    val keypairPath = "../../testkey/master.json"
//    val rpcUrl = "https://api.devnet.solana.com" // Default to localhost
//
//    // Check if keypair exists
//    if (!File(keypairPath).exists()) {
//        println("   Please ensure you have a funded keypair at this location")
//        return@runBlocking
//    }
//
//    val network = when {
//        rpcUrl.contains("devnet") -> "Devnet"
//        rpcUrl.contains("localhost") || rpcUrl.contains("127.0.0.1") -> "Localhost"
//        rpcUrl.contains("mainnet") -> "Mainnet"
//        else -> "Custom"
//    }
//    println()
//
//    // Create blockchain service
//    val signerConfig = SignerConfig.File(keypairPath)
//    val blockchainService = BlockchainServiceImpl(rpcUrl, "confirmed", signerConfig)
//
//    // Get authority pubkey
//    val authorityPubkey = blockchainService.getAuthorityPubkey()
//    println()
//
//    // Check program configuration
//    val configResult = blockchainService.getProgramConfig()
//
//    if (configResult.isFailure) {
//        return@runBlocking
//    }
//
//    val config = configResult.getOrThrow()
//    if (config == null) {
//        if (rpcUrl.contains("localhost") || rpcUrl.contains("127.0.0.1")) {
//            // On localhost, auto-initialize for convenience
//
//            val maxSessionValue = 1_000_000_000L
//            val initResult = blockchainService.initProgramConfig(maxSessionValue)
//
//            if (initResult.isSuccess) {
//                val newConfig = initResult.getOrThrow()
//                println("   Admin: ${newConfig.adminPubkey}")
//                println("   Max session value: ${newConfig.maxSessionValue}")
//            } else {
//                return@runBlocking
//            }
//        } else {
//            println()
//            println("Please initialize the program first using the Admin CLI:")
//            println("1. cd coral-kotlin")
//            println("2. ./gradlew :examples:adminCLI --args=\"init-config 1000000000\"")
//            return@runBlocking
//        }
//    } else {
//        println("   Admin: ${config.adminPubkey}")
//        println("   Paused: ${config.paused}")
//        println("   Max session value: ${config.maxSessionValue} lamports")
//
//        if (config.paused) {
//            println()
//            println("   Please unpause it using the Admin CLI:")
//            println("   ./gradlew :examples:adminCLI --args=\"update-config --unpause\"")
//            return@runBlocking
//        }
//    }
//
//    println()
//    println("=" * 60)
//    println("=" * 60)
//    println()
//
//    // Create a new SPL token mint
//    val mintResult = blockchainService.createMint()
//    if (mintResult.isFailure) {
//        println("   Make sure your wallet has enough SOL for transactions")
//        return@runBlocking
//    }
//
//    val mintInfo = mintResult.getOrThrow()
//    val mintPubkey = mintInfo.mintPubkey
//    println("   Decimals: ${mintInfo.decimals}")
//
//    // Check if mint is allowed
//    println()
//    val isAllowedResult = blockchainService.isMintAllowed(mintPubkey)
//    if (isAllowedResult.isFailure) {
//        return@runBlocking
//    }
//
//    if (!isAllowedResult.getOrThrow()) {
//        val addResult = blockchainService.addAllowedMint(mintPubkey)
//        if (addResult.isFailure) {
//            println("   You may need admin privileges to add mints")
//            return@runBlocking
//        }
//
//        // Small delay to ensure transaction is confirmed
//        delay(2000)
//    } else {
//    }
//
//    // Create ATA for authority
//    println()
//    val ataResult = blockchainService.createATA(mintPubkey, authorityPubkey)
//    if (ataResult.isFailure) {
//        return@runBlocking
//    }
//    val authorityAta = ataResult.getOrThrow()
//
//    // Mint tokens to authority
//    println()
//    val mintAmount = 1_000_000L
//    val mintToResult = blockchainService.mintTo(mintPubkey, authorityAta, mintAmount)
//    if (mintToResult.isFailure) {
//        return@runBlocking
//    }
//
//    // Define agents for the session
//    // In this demo, authority acts as the developer for all agents
//    val agents = listOf(
//        CoralRequestBuilders.agent("data_analyst", 100_000, authorityPubkey),
//        CoralRequestBuilders.agent("ml_engineer", 200_000, authorityPubkey),
//        CoralRequestBuilders.agent("qa_tester", 50_000, authorityPubkey)
//    )
//
//    println()
//    println("=" * 60)
//    println("=" * 60)
//
//    println()
//    agents.forEach { agent ->
//        println("   - ${agent.id}: max ${agent.cap} tokens")
//    }
//    val totalCap = agents.sumOf { it.cap }
//    println("   Total cap: $totalCap tokens")
//
//    // Create session
//    println()
//    val sessionResult = blockchainService.createSession(agents, mintPubkey)
//    if (sessionResult.isFailure) {
//        return@runBlocking
//    }
//
//    val sessionInfo = sessionResult.getOrThrow()
//    val sessionId = sessionInfo.sessionId
//    println("   Session ID: $sessionId")
//    println("   Transaction: ${sessionInfo.transactionHash}")
//
//    // Fund the session
//    println()
//    val fundResult = blockchainService.fundSession(sessionId, totalCap)
//    if (fundResult.isFailure) {
//        return@runBlocking
//    }
//
//    println("   Transaction: ${fundResult.getOrThrow().signature}")
//
//    // Wait for confirmations
//    println()
//    delay(3000)
//
//    println()
//    println("=" * 60)
//    println("=" * 60)
//
//    // Agent claims
//    println()
//
//    // Data analyst claims
//    println()
//    val claim1 = blockchainService.submitClaim(sessionId, "data_analyst", 80_000)
//    if (claim1.isSuccess) {
//        val result = claim1.getOrThrow()
//        println("   Transaction: ${result.signature}")
//    } else {
//    }
//
//    // ML engineer claims
//    println()
//    val claim2 = blockchainService.submitClaim(sessionId, "ml_engineer", 150_000)
//    if (claim2.isSuccess) {
//        val result = claim2.getOrThrow()
//        println("   Transaction: ${result.signature}")
//    } else {
//    }
//
//    // QA tester claims
//    println()
//    val claim3 = blockchainService.submitClaim(sessionId, "qa_tester", 40_000)
//    if (claim3.isSuccess) {
//        val result = claim3.getOrThrow()
//        println("   Transaction: ${result.signature}")
//    } else {
//    }
//
//    // Test error handling
//    println()
//    println("=" * 60)
//    println("=" * 60)
//
//    println()
//    val duplicateClaim = blockchainService.submitClaim(sessionId, "data_analyst", 10_000)
//    if (duplicateClaim.isFailure) {
//    } else {
//    }
//
//    println()
//    val unknownClaim = blockchainService.submitClaim(sessionId, "hacker", 10_000)
//    if (unknownClaim.isFailure) {
//    } else {
//    }
//
//    println()
//    val overCapClaim = blockchainService.submitClaim(sessionId, "qa_tester", 20_000)
//    if (overCapClaim.isFailure) {
//    } else {
//    }
//
//    // Refund leftover
//    println()
//    println("=" * 60)
//    println("=" * 60)
//
//    println()
//    val refundResult = blockchainService.refundLeftover(sessionId, mintPubkey)
//    if (refundResult.isSuccess) {
//        val refund = refundResult.getOrThrow()
//        println("   Amount refunded: ${refund.amountRefunded} tokens")
//        println("   Transaction: ${refund.signature}")
//    } else {
//    }
//
//    println()
//    println("=" * 60)
//    println("=" * 60)
//    println()
//    println("Summary:")
//    println()
//    println("The distributed JAR makes it easy to integrate Coral Protocol")
//    println("into any JVM-based application without manual FFI setup!")
//}
//
//// Extension function for string repetition
//operator fun String.times(n: Int): String = this.repeat(n)